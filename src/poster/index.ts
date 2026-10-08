import { Client, TextChannel } from "discord.js";
import { prisma } from "@/db/client";
import { isFreshForDiscord } from "@/lib/freshness";
import { buildPostingEmbed } from "./embed";
import { claimDiscordSend, releaseDiscordClaim } from "./claim";
import { filterEnabledRoleFamilies, getEnabledRoleFamilies } from "@/config/roles.config";

interface PostingToSend {
  title: string;
  company: string;
  location: string | null;
  url: string;
  level: string;
  sourceName: string;
  roleFamily: string[];
  roleTitles: string[];
  postedAt?: Date;
}

type QueueItem = {
  posting: PostingToSend;
  dedupHash: string;
  guildId?: string;
  resolve: () => void;
  reject: (e: unknown) => void;
};

export class Poster {
  private channelCache = new Map<string, TextChannel>();
  private queue: QueueItem[] = [];
  private draining = false;
  private stopped = false;

  constructor(
    private readonly client: Client,
    private readonly prismaClient?: typeof prisma,
    private readonly intervalMs = 2000
  ) {}

  async send(posting: PostingToSend, dedupHash: string, guildId?: string): Promise<void> {
    if (this.stopped) throw new Error("Poster stopped");
    return new Promise((resolve, reject) => {
      this.queue.push({ posting, dedupHash, guildId, resolve, reject });
      void this.drain();
    });
  }

  stop(): void {
    this.stopped = true;
    this.queue = [];
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0 && !this.stopped) {
        const item = this.queue.shift()!;
        try {
          await this.deliver(item.posting, item.dedupHash, item.guildId);
          item.resolve();
        } catch (e) {
          item.reject(e);
        }
        if (this.queue.length > 0) {
          await new Promise((r) => setTimeout(r, this.intervalMs));
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async deliver(
    posting: PostingToSend,
    dedupHash: string,
    onlyGuildId?: string
  ): Promise<void> {
    const prismaImpl = this.prismaClient ?? prisma;

    const roleFamilies = filterEnabledRoleFamilies(posting.roleFamily);
    if (roleFamilies.length === 0) return;

    const channels = (
      await prismaImpl.channelMap.findMany({
        where: {
          kind: "job",
          roleFamily: { in: roleFamilies },
          ...(onlyGuildId ? { guildId: onlyGuildId } : { guildId: { not: "" } }),
        },
      })
    ).filter((channel) => channel.guildId);

    if (channels.length === 0) return;

    const guildIds = [...new Set(channels.map((channel) => channel.guildId))];
    const states = await prismaImpl.guildState.findMany({
      where: { guildId: { in: guildIds } },
    });
    const liveByGuild = new Map(states.map((state) => [state.guildId, state.liveSince]));
    const readyGuilds = guildIds.filter((guildId) => liveByGuild.has(guildId));
    if (readyGuilds.length === 0) return;

    const existingDeliveries = await prismaImpl.postingDelivery.findMany({
      where: { dedupHash, guildId: { in: readyGuilds } },
      select: { guildId: true, channelId: true },
    });
    const delivered = new Set(existingDeliveries.map((row) => `${row.guildId}:${row.channelId}`));

    const embed = buildPostingEmbed(posting);
    let anyFailed = false;

    for (const guildId of readyGuilds) {
      const liveSince = liveByGuild.get(guildId);
      if (!liveSince) continue;
      if (!isFreshForDiscord(posting.postedAt ?? null, liveSince, posting.sourceName)) continue;

      const pending = channels.filter(
        (channel) => channel.guildId === guildId && !delivered.has(`${guildId}:${channel.channelId}`)
      );
      if (pending.length === 0) continue;

      const claimed = await claimDiscordSend(
        prismaImpl,
        dedupHash,
        posting.title,
        posting.company,
        guildId
      );
      if (!claimed) continue;

      let sent = 0;
      for (const ch of pending) {
        try {
          let channel = this.channelCache.get(ch.channelId);
          if (!channel) {
            const fetched = await this.client.channels.fetch(ch.channelId);
            if (!fetched?.isTextBased()) {
              anyFailed = true;
              continue;
            }
            channel = fetched as TextChannel;
            this.channelCache.set(ch.channelId, channel);
          }
          const guild = channel.guild;
          const pingRoleIds: string[] = [];
          if (guild) {
            for (const family of getEnabledRoleFamilies()) {
              if (!roleFamilies.includes(family.family)) continue;
              if (family.family !== ch.roleFamily) continue;
              const role = guild.roles.cache.find((r) => r.name === family.roleName);
              if (role) pingRoleIds.push(role.id);
            }
          }
          const roleMentions = pingRoleIds.length > 0 ? pingRoleIds.map((id) => `<@&${id}>`).join(" ") : undefined;
          await channel.send({
            content: roleMentions,
            embeds: [embed],
            allowedMentions: roleMentions ? { roles: pingRoleIds } : undefined,
          });
          await prismaImpl.postingDelivery.create({
            data: { dedupHash, guildId, channelId: ch.channelId },
          });
          sent++;
        } catch (err) {
          anyFailed = true;
          console.error(`Failed to send to channel ${ch.channelId}:`, err);
        }
      }

      if (sent === 0) {
        anyFailed = true;
        await releaseDiscordClaim(prismaImpl, dedupHash, posting.title, posting.company, guildId);
      }
    }

    if (anyFailed) return;

    try {
      const all = await prismaImpl.postingDelivery.findMany({
        where: { dedupHash },
        select: { channelId: true },
      });
      await prismaImpl.posting.update({
        where: { dedupHash },
        data: {
          postedAt: new Date(),
          channelIds: JSON.stringify([...new Set(all.map((row) => row.channelId))]),
        },
      });
    } catch (err) {
      console.error(`Failed to mark posting ${dedupHash} as posted:`, err);
    }
  }
}

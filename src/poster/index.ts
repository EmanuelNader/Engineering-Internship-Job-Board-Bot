import { Client, TextChannel } from "discord.js";
import { prisma } from "@/db/client";
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

  async send(posting: PostingToSend, dedupHash: string): Promise<void> {
    if (this.stopped) throw new Error("Poster stopped");
    return new Promise((resolve, reject) => {
      this.queue.push({ posting, dedupHash, resolve, reject });
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
          await this.deliver(item.posting, item.dedupHash);
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
    dedupHash: string
  ): Promise<void> {
    const prismaImpl = this.prismaClient ?? prisma;

    const roleFamilies = filterEnabledRoleFamilies(posting.roleFamily);
    if (roleFamilies.length === 0) return;

    const channels = await prismaImpl.channelMap.findMany({
      where: { kind: "job", roleFamily: { in: roleFamilies } },
    });

    if (channels.length === 0) return;

    const claimed = await claimDiscordSend(prismaImpl, dedupHash, posting.title, posting.company);
    if (!claimed) return;

    const embed = buildPostingEmbed(posting);
    const sentChannelIds: string[] = [];

    for (const ch of channels) {
      try {
        let channel = this.channelCache.get(ch.channelId);
        if (!channel) {
          const fetched = await this.client.channels.fetch(ch.channelId);
          if (!fetched?.isTextBased()) continue;
          channel = fetched as TextChannel;
          this.channelCache.set(ch.channelId, channel);
        }
        const guild = channel.guild;
        const pingRoleIds: string[] = [];
        if (guild) {
          for (const family of getEnabledRoleFamilies()) {
            if (!roleFamilies.includes(family.family)) continue;
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
        sentChannelIds.push(ch.channelId);
      } catch (err) {
        console.error(`Failed to send to channel ${ch.channelId}:`, err);
      }
    }

    if (sentChannelIds.length === 0) {
      await releaseDiscordClaim(prismaImpl, dedupHash, posting.title, posting.company);
      return;
    }

    try {
      await prismaImpl.posting.update({
        where: { dedupHash },
        data: {
          postedAt: new Date(),
          channelIds: JSON.stringify(sentChannelIds),
        },
      });
    } catch (err) {
      console.error(`Failed to mark posting ${dedupHash} as posted:`, err);
    }
  }
}

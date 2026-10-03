import { createHash } from "node:crypto";
import { fetchJson } from "@/adapters/base";

export function gitBlobSha(content: string): string {
  const body = Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${body.length}\0`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

interface GitTreeEntry {
  path: string;
  type: string;
  sha: string;
}

interface GitTree {
  sha: string;
  tree: GitTreeEntry[];
}

export interface ListingFile {
  path: string;
  content: string;
}

export interface CommitFilesInput {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: ListingFile[];
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function api(owner: string, repo: string, path: string): string {
  return `https://api.github.com/repos/${owner}/${repo}${path}`;
}

function branchRef(branch: string): string {
  return branch.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function blobShaAtPath(
  owner: string,
  repo: string,
  headers: Record<string, string>,
  root: GitTree,
  path: string
): Promise<string | null> {
  const parts = path.split("/");
  let tree = root;
  for (let i = 0; i < parts.length; i++) {
    const entry = tree.tree.find((item) => item.path === parts[i]);
    if (!entry) return null;
    const last = i === parts.length - 1;
    if (last) return entry.type === "blob" ? entry.sha : null;
    if (entry.type !== "tree") return null;
    tree = await fetchJson<GitTree>(api(owner, repo, `/git/trees/${entry.sha}`), { headers });
  }
  return null;
}

/** Commit files in one revision. Skips the write when every blob already matches. */
export async function commitFiles(input: CommitFilesInput): Promise<"skipped" | "committed"> {
  const headers = githubHeaders(input.token);
  const { owner, repo } = input;
  const refPath = branchRef(input.branch);
  const timeoutMs = 30_000;

  const ref = await fetchJson<{ object: { sha: string } }>(api(owner, repo, `/git/ref/heads/${refPath}`), {
    headers,
    timeoutMs,
  });
  const parent = await fetchJson<{ tree: { sha: string } }>(api(owner, repo, `/git/commits/${ref.object.sha}`), {
    headers,
    timeoutMs,
  });
  const root = await fetchJson<GitTree>(api(owner, repo, `/git/trees/${parent.tree.sha}`), {
    headers,
    timeoutMs,
  });

  const desired: { path: string; content: string; sha: string; current: string | null }[] = [];
  for (const file of input.files) {
    const sha = gitBlobSha(file.content);
    const current = await blobShaAtPath(owner, repo, headers, root, file.path);
    desired.push({ path: file.path, content: file.content, sha, current });
  }

  if (desired.every((file) => file.current === file.sha)) return "skipped";

  const updates: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const file of desired) {
    if (file.current === file.sha) {
      updates.push({ path: file.path, mode: "100644", type: "blob", sha: file.sha });
      continue;
    }
    const blob = await fetchJson<{ sha: string }>(api(owner, repo, "/git/blobs"), {
      method: "POST",
      headers,
      timeoutMs,
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    updates.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await fetchJson<{ sha: string }>(api(owner, repo, "/git/trees"), {
    method: "POST",
    headers,
    timeoutMs,
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: updates }),
  });
  const created = await fetchJson<{ sha: string }>(api(owner, repo, "/git/commits"), {
    method: "POST",
    headers,
    timeoutMs,
    body: JSON.stringify({
      message: input.message,
      tree: tree.sha,
      parents: [ref.object.sha],
    }),
  });
  await fetchJson(api(owner, repo, `/git/refs/heads/${refPath}`), {
    method: "PATCH",
    headers,
    timeoutMs,
    body: JSON.stringify({ sha: created.sha }),
  });
  return "committed";
}

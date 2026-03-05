/**
 * Remote URL detection and commit URL construction.
 *
 * Security:
 *  - SHAs are validated with a strict hex regex before being embedded in URLs.
 *  - Remote URLs are parsed and only known provider patterns are accepted.
 *  - Only https:// URLs are ever returned; ssh/git protocols are normalised first.
 */

import { execFile } from "child_process";
import type { RemoteInfo, RemoteProvider } from "./types";
import { isValidSha } from "./gitBlame";

// Cache remote info per repo root so we don't shell out on every line change.
const remoteCache = new Map<string, RemoteInfo | null>();

/** Run git and return stdout, or null on error. */
function runGit(args: string[], cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

/**
 * Normalise any git remote URL (ssh, git://, https://) to an https:// URL.
 * Returns null if the URL cannot be normalised to a known provider.
 *
 * Examples handled:
 *   git@github.com:owner/repo.git        → https://github.com/owner/repo
 *   https://github.com/owner/repo.git    → https://github.com/owner/repo
 *   git://github.com/owner/repo.git      → https://github.com/owner/repo
 *   https://user@bitbucket.org/o/r.git   → https://bitbucket.org/o/r
 */
function normaliseRemoteUrl(raw: string): string | null {
  let url = raw.trim();

  // Strip trailing .git
  url = url.replace(/\.git$/, "");

  // Convert SCP-style SSH: git@host:path → https://host/path
  const scpMatch = url.match(/^git@([^:]+):(.+)$/);
  if (scpMatch) {
    url = `https://${scpMatch[1]}/${scpMatch[2]}`;
  }

  // Convert git:// → https://
  url = url.replace(/^git:\/\//, "https://");

  // Strip user info (e.g. https://user@host → https://host)
  url = url.replace(/^(https?:\/\/)[^@]+@/, "$1");

  // Only allow https at this point
  if (!url.startsWith("https://")) {
    return null;
  }

  // Basic sanity: must look like https://host/path
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin + parsed.pathname;
  } catch {
    return null;
  }
}

/** Detect which provider hosts a given normalised base URL. */
function detectProvider(baseUrl: string): RemoteProvider {
  if (/github\.com/i.test(baseUrl)) {
    return "github";
  }
  if (/gitlab\.com|gitlab\./i.test(baseUrl)) {
    return "gitlab";
  }
  if (/bitbucket\.org/i.test(baseUrl)) {
    return "bitbucket";
  }
  if (/dev\.azure\.com|visualstudio\.com/i.test(baseUrl)) {
    return "azure";
  }
  return "unknown";
}

/**
 * Build a commit URL for a given provider and base repo URL.
 * Returns null for unknown providers.
 */
function buildCommitUrl(
  provider: RemoteProvider,
  baseUrl: string,
  sha: string
): string | null {
  switch (provider) {
    case "github":
      return `${baseUrl}/commit/${sha}`;
    case "gitlab":
      return `${baseUrl}/-/commit/${sha}`;
    case "bitbucket":
      return `${baseUrl}/commits/${sha}`;
    case "azure": {
      // Azure DevOps: https://dev.azure.com/{org}/{project}/_git/{repo}
      // Commit URL:   https://dev.azure.com/{org}/{project}/_git/{repo}/commit/{sha}
      return `${baseUrl}/commit/${sha}`;
    }
    default:
      // For unknown providers, attempt a generic /commit/{sha} suffix
      return `${baseUrl}/commit/${sha}`;
  }
}

/**
 * Resolve remote info for a repository root.
 * Results are cached per root for the lifetime of the extension session.
 * Returns null if no usable remote is found.
 */
export async function getRemoteInfo(repoRoot: string): Promise<RemoteInfo | null> {
  if (remoteCache.has(repoRoot)) {
    return remoteCache.get(repoRoot) ?? null;
  }

  // Try "origin" first, then the first available remote.
  let rawUrl = await runGit(["remote", "get-url", "origin"], repoRoot);
  if (!rawUrl) {
    const remoteList = await runGit(["remote"], repoRoot);
    const firstRemote = remoteList?.split("\n")[0].trim();
    if (firstRemote) {
      rawUrl = await runGit(["remote", "get-url", firstRemote], repoRoot);
    }
  }

  if (!rawUrl) {
    remoteCache.set(repoRoot, null);
    return null;
  }

  const baseUrl = normaliseRemoteUrl(rawUrl);
  if (!baseUrl) {
    remoteCache.set(repoRoot, null);
    return null;
  }

  const provider = detectProvider(baseUrl);
  const info: RemoteInfo = {
    provider,
    commitUrlTemplate: baseUrl,
  };

  remoteCache.set(repoRoot, info);
  return info;
}

/**
 * Build the full URL to view a specific commit on the remote.
 * Returns null if the SHA is invalid or no remote info is available.
 */
export function commitUrl(remoteInfo: RemoteInfo, sha: string): string | null {
  if (!isValidSha(sha)) {
    return null;
  }
  return buildCommitUrl(remoteInfo.provider, remoteInfo.commitUrlTemplate, sha);
}

/** Invalidate the remote URL cache for a specific repo root. */
export function invalidateRemoteCache(repoRoot: string): void {
  remoteCache.delete(repoRoot);
}

/** Clear the entire remote cache (e.g. on deactivation). */
export function clearRemoteCache(): void {
  remoteCache.clear();
}

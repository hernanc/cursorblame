/**
 * File authorship statistics (v0.5).
 *
 * Aggregates a FileBlameMap into a human-readable summary of:
 *  - total commits
 *  - top contributors (by lines authored)
 *  - first and last commit dates
 *
 * Dependency: types.ts only — no vscode import, fully unit-testable.
 */

import type { FileBlameMap, FileStats } from "./types";

/**
 * Compute authorship statistics from a complete file blame map.
 *
 * @param fileBlame  The per-line blame map produced by blameFile().
 * @returns          Aggregated FileStats for the file.
 */
export function computeFileStats(fileBlame: FileBlameMap): FileStats {
  const commitSet = new Set<string>();
  // authorEmail → { author, authorEmail, lines }
  const authorMap = new Map<
    string,
    { author: string; authorEmail: string; lines: number }
  >();

  let lastModified = 0;
  let firstCommit = Number.MAX_SAFE_INTEGER;

  for (const info of fileBlame.values()) {
    if (info.isUncommitted) {
      continue;
    }

    commitSet.add(info.sha);

    if (info.authorTime > lastModified) {
      lastModified = info.authorTime;
    }
    if (info.authorTime < firstCommit) {
      firstCommit = info.authorTime;
    }

    const key = info.authorEmail || info.author;
    const existing = authorMap.get(key);
    if (existing) {
      existing.lines++;
    } else {
      authorMap.set(key, {
        author: info.author,
        authorEmail: info.authorEmail,
        lines: 1,
      });
    }
  }

  const topAuthors = Array.from(authorMap.values()).sort(
    (a, b) => b.lines - a.lines
  );

  return {
    totalCommits: commitSet.size,
    topAuthors,
    lastModified: lastModified === 0 ? 0 : lastModified,
    firstCommit: firstCommit === Number.MAX_SAFE_INTEGER ? 0 : firstCommit,
  };
}

/**
 * Format a FileStats object into a Markdown string suitable for a VSCode
 * WebviewPanel or information message.
 */
export function formatFileStats(stats: FileStats, filePath: string): string {
  const filename = filePath.split(/[/\\]/).pop() ?? filePath;
  const lines: string[] = [
    `## Authorship: \`${filename}\``,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Commits | **${stats.totalCommits}** |`,
    `| First commit | ${stats.firstCommit ? new Date(stats.firstCommit * 1000).toLocaleDateString() : "—"} |`,
    `| Last modified | ${stats.lastModified ? new Date(stats.lastModified * 1000).toLocaleDateString() : "—"} |`,
    "",
    "### Top contributors",
    "",
  ];

  const top = stats.topAuthors.slice(0, 10);
  for (const a of top) {
    lines.push(`- **${a.author}** — ${a.lines} line${a.lines !== 1 ? "s" : ""}`);
  }

  return lines.join("\n");
}

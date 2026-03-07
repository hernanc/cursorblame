/**
 * Git blame execution and line-porcelain parsing.
 *
 * Security:
 *  - ALL git invocations use execFile() with an explicit argument array.
 *    The shell option is never enabled — no shell string interpolation.
 *  - File paths are always placed after `--` to prevent path-as-option injection.
 *  - SHAs are validated with isValidSha() before use in any URL.
 */

import { execFile } from "child_process";
import * as path from "path";
import type { BlameInfo, FileBlameMap } from "./types";

/** SHA used by git blame for lines that have not been committed. */
const UNCOMMITTED_SHA = "0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Validate that a string is a 40-char lowercase hex SHA-1. */
export function isValidSha(sha: string): boolean {
  return /^[0-9a-f]{40}$/.test(sha);
}

/**
 * Normalise a file path to use forward slashes.
 * On POSIX this is a no-op; on Windows it converts backslashes.
 * Git on all platforms accepts forward-slash paths.
 */
export function normalizeFilePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

// ---------------------------------------------------------------------------
// Internal git runner
// ---------------------------------------------------------------------------

/**
 * Run a git command safely using execFile and return stdout.
 * @param args  Argument array passed directly to git (no shell expansion).
 * @param cwd   Working directory for the command.
 */
export function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`git ${args[0]} failed: ${stderr.trim() || err.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

// ---------------------------------------------------------------------------
// Repository queries
// ---------------------------------------------------------------------------

/**
 * Retrieve the git root for a given file path.
 * Returns null if the file is not inside a git repository.
 */
export async function getGitRoot(filePath: string): Promise<string | null> {
  try {
    const dir = path.dirname(filePath);
    const root = await runGit(["rev-parse", "--show-toplevel"], dir);
    return root.trim();
  } catch {
    return null;
  }
}

/**
 * Retrieve the current HEAD SHA for the repository at the given root.
 * Returns null if HEAD is unavailable (e.g. initial commit, detached HEAD with no commits).
 */
export async function getGitHead(repoRoot: string): Promise<string | null> {
  try {
    const head = await runGit(["rev-parse", "HEAD"], repoRoot);
    return head.trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Porcelain parser
// ---------------------------------------------------------------------------

/**
 * Parse git blame --line-porcelain output into a FileBlameMap.
 *
 * Porcelain format per-hunk:
 *   <40-sha> <orig-line> <final-line> [<num-lines>]
 *   author <name>
 *   author-mail <email>
 *   author-time <unix-ts>
 *   author-tz <+hhmm>
 *   committer ...
 *   summary <message>
 *   [previous <sha> <filename>]
 *   filename <name>
 *   \t<line content>
 *
 * Exported for unit testing.
 */
export function parsePorcelain(output: string): FileBlameMap {
  const result: FileBlameMap = new Map();
  const lines = output.split("\n");
  let i = 0;

  while (i < lines.length) {
    const headerLine = lines[i];
    // Each hunk starts with a SHA line: 40hex space origLine space finalLine [space numLines]
    if (!headerLine || !/^[0-9a-f]{40} /.test(headerLine)) {
      i++;
      continue;
    }

    const parts = headerLine.split(" ");
    const sha = parts[0];
    const finalLine = parseInt(parts[2], 10);

    let author = "";
    let authorEmail = "";
    let authorTime = 0;
    let summary = "";

    i++;
    while (i < lines.length && !lines[i].startsWith("\t")) {
      const line = lines[i];
      if (line.startsWith("author ") && !line.startsWith("author-")) {
        author = line.slice(7).trim();
      } else if (line.startsWith("author-mail ")) {
        // Strip angle brackets: <email@example.com>
        authorEmail = line.slice(12).trim().replace(/^<|>$/g, "");
      } else if (line.startsWith("author-time ")) {
        authorTime = parseInt(line.slice(12).trim(), 10);
      } else if (line.startsWith("summary ")) {
        summary = line.slice(8).trim();
      }
      i++;
    }

    // Skip the tab-prefixed content line
    i++;

    const isUncommitted = sha === UNCOMMITTED_SHA;
    const info: BlameInfo = {
      sha,
      shortSha: sha.slice(0, 8),
      author: isUncommitted ? "You" : author || "Unknown",
      authorEmail,
      authorTime,
      summary: isUncommitted ? "Uncommitted changes" : summary || "(no message)",
      isUncommitted,
    };

    if (!isNaN(finalLine) && finalLine > 0) {
      result.set(finalLine, info);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public blame API
// ---------------------------------------------------------------------------

/**
 * Run git blame on an entire file and return a per-line blame map.
 * Returns null if the file is not tracked by git or blame fails.
 *
 * @param filePath       Absolute path to the file.
 * @param repoRoot       Root of the git repository.
 * @param ignoreWs       Whether to pass -w (ignore whitespace).
 * @param followMerges   Whether to pass --first-parent (v0.2).
 * @param followRenames  Whether to pass --follow (v0.5, only via blameFileFollow).
 */
export async function blameFile(
  filePath: string,
  repoRoot: string,
  ignoreWs: boolean,
  followMerges = false,
  followRenames = false
): Promise<FileBlameMap | null> {
  const normPath = normalizeFilePath(filePath);
  const args = ["blame", "--line-porcelain"];
  if (ignoreWs) {
    args.push("-w");
  }
  if (followMerges) {
    args.push("--first-parent");
  }
  if (followRenames) {
    args.push("--follow");
  }
  // Use -- to separate options from path (prevents path-as-option injection)
  args.push("--", normPath);

  try {
    const output = await runGit(args, repoRoot);
    return parsePorcelain(output);
  } catch {
    // Suppress "no such path in HEAD" (untracked / new file) errors silently
    return null;
  }
}

/**
 * Convenience wrapper: run blame with --follow to handle renamed files (v0.5).
 * The cache should be keyed by the canonical current path, not any historical path.
 */
export async function blameFileFollow(
  filePath: string,
  repoRoot: string,
  ignoreWs: boolean,
  followMerges: boolean
): Promise<FileBlameMap | null> {
  return blameFile(filePath, repoRoot, ignoreWs, followMerges, true);
}

/**
 * Fetch the full commit message body for a given SHA (v0.4).
 * Returns null if the SHA is invalid or the commit cannot be read.
 *
 * Security: SHA is validated before use; execFile is used (no shell).
 */
export async function getCommitBody(sha: string, repoRoot: string): Promise<string | null> {
  if (!isValidSha(sha)) {
    return null;
  }
  try {
    // %B = raw commit body (subject + blank line + body)
    const output = await runGit(["show", "--format=%B", "-s", "--", sha], repoRoot);
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Get the list of files changed in the last `days` days (v0.5, used by hotspot).
 * Returns a map of file path → number of times it was modified.
 *
 * Security: all arguments are literal strings; no user input is interpolated.
 */
export async function getHotspotFiles(
  repoRoot: string,
  days: number
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    const since = `${Math.max(1, days)}.days.ago`;
    const output = await runGit(
      ["log", `--since=${since}`, "--name-only", "--format=", "--", "."],
      repoRoot
    );
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        const fullPath = path.posix.join(repoRoot, trimmed);
        result.set(fullPath, (result.get(fullPath) ?? 0) + 1);
      }
    }
  } catch {
    // best-effort; return empty map on failure
  }
  return result;
}

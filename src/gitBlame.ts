/**
 * Git blame execution and line-porcelain parsing.
 *
 * Security: All git invocations use execFile() with an explicit argument
 * array — never shell string interpolation — to prevent command injection.
 */

import { execFile } from "child_process";
import * as path from "path";
import type { BlameInfo, FileBlameMap } from "./types";

/** SHA used by git blame for lines that have not been committed. */
const UNCOMMITTED_SHA = "0000000000000000000000000000000000000000";

/** Validate that a string is a 40-char hex SHA. */
export function isValidSha(sha: string): boolean {
  return /^[0-9a-f]{40}$/.test(sha);
}

/**
 * Run a git command safely using execFile and return stdout.
 * @param args   Argument array passed directly to git (no shell expansion).
 * @param cwd    Working directory for the command.
 */
function runGit(args: string[], cwd: string): Promise<string> {
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
 */
function parsePorcelain(output: string): FileBlameMap {
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

/**
 * Run git blame on an entire file and return a per-line blame map.
 * Returns null if the file is not tracked by git or blame fails.
 *
 * @param filePath       Absolute path to the file.
 * @param repoRoot       Root of the git repository.
 * @param ignoreWs       Whether to pass -w (ignore whitespace).
 */
export async function blameFile(
  filePath: string,
  repoRoot: string,
  ignoreWs: boolean
): Promise<FileBlameMap | null> {
  const args = ["blame", "--line-porcelain"];
  if (ignoreWs) {
    args.push("-w");
  }
  // Use -- to separate options from path (prevents path-as-option injection)
  args.push("--", filePath);

  try {
    const output = await runGit(args, repoRoot);
    return parsePorcelain(output);
  } catch (err) {
    // Suppress "no such path in HEAD" (untracked / new file) errors silently
    return null;
  }
}

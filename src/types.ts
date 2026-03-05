/**
 * Shared TypeScript interfaces and types for CursorBlame extension.
 */

/** Raw blame data for a single line, parsed from git blame --line-porcelain. */
export interface BlameInfo {
  /** Full 40-character commit SHA. */
  sha: string;
  /** Short 8-character SHA for display. */
  shortSha: string;
  /** Author display name. */
  author: string;
  /** Author email (for future avatar support). */
  authorEmail: string;
  /** Unix timestamp of the commit author time. */
  authorTime: number;
  /** Commit summary (first line of commit message). */
  summary: string;
  /** True if the line has not been committed yet (uncommitted changes). */
  isUncommitted: boolean;
}

/** Map of 1-based line number to BlameInfo for an entire file. */
export type FileBlameMap = Map<number, BlameInfo>;

/** Supported remote git providers. */
export type RemoteProvider =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "azure"
  | "unknown";

/** Result of remote URL detection. */
export interface RemoteInfo {
  provider: RemoteProvider;
  /** The base commit URL template. Call buildCommitUrl(sha) to get the full URL. */
  commitUrlTemplate: string;
}

/** Extension configuration snapshot. */
export interface BlameConfig {
  enabled: boolean;
  format: string;
  maxSummaryLength: number;
  foregroundColor: string;
  debounceMs: number;
  ignoreWhitespace: boolean;
}

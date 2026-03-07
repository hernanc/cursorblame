/**
 * Shared TypeScript interfaces and types for CursorBlame extension.
 * Zero imports — leaf of the dependency tree.
 */

/** Raw blame data for a single line, parsed from git blame --line-porcelain. */
export interface BlameInfo {
  /** Full 40-character commit SHA. */
  sha: string;
  /** Short 8-character SHA for display. */
  shortSha: string;
  /** Author display name. */
  author: string;
  /** Author email (for avatar, colour-coding). */
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
  /** The base commit URL template. Call commitUrl(sha) to get the full URL. */
  commitUrlTemplate: string;
}

/**
 * Annotation display mode (v0.2+).
 * "hover"  – clear & redebounce on every selection change (current-line shows
 *             only after the cursor has been completely still for debounceMs).
 * "always" – keep the annotation visible while typing on the same line; only
 *             clear + redebounce when the cursor moves to a different line.
 */
export type BlameMode = "hover" | "always";

/** Extension configuration snapshot — built by readConfig() in extension.ts. */
export interface BlameConfig {
  enabled: boolean;
  /** Format template, e.g. "{author}, {timeAgo} • {summary}". */
  format: string;
  maxSummaryLength: number;
  /** CSS colour or "theme:<tokenId>". Empty = codeLens default. */
  foregroundColor: string;
  debounceMs: number;
  ignoreWhitespace: boolean;
  // ── v0.2 ──────────────────────────────────────────────────────────────────
  mode: BlameMode;
  /** Pass --first-parent to git blame when true. */
  followMerges: boolean;
  // ── v0.3 ──────────────────────────────────────────────────────────────────
  /** Commits older than this many days show at minimum opacity. Default 365. */
  ageFadeMaxDays: number;
  /** Show short SHA + author initials on every line (full-file gutter). */
  gutterMode: boolean;
  /** Colorise blame text per-author using a stable hash-derived hue. */
  authorColors: boolean;
  // ── v0.5 ──────────────────────────────────────────────────────────────────
  /** Author names/emails whose blame entries are skipped. */
  ignoredAuthors: string[];
  // ── v1.1 ──────────────────────────────────────────────────────────────────
  /**
   * When > 0, gutter mode only annotates lines changed within this many days.
   * 0 means annotate all lines (original behaviour).
   */
  gutterRecentDays: number;
  /** When false, hotspot file badges in the Explorer are disabled. */
  hotspotEnabled: boolean;
  // ── v1.2 ──────────────────────────────────────────────────────────────────
  /** Duration in minutes for the snooze command. Default 30. */
  snoozeDurationMinutes: number;
}

/** Aggregated per-file authorship statistics (v0.5+). */
export interface FileStats {
  /** Number of distinct commits that touched this file. */
  totalCommits: number;
  /** Authors ranked by lines contributed (descending). */
  topAuthors: Array<{ author: string; authorEmail: string; lines: number }>;
  /** Unix timestamp of the most recent commit. */
  lastModified: number;
  /** Unix timestamp of the oldest commit. */
  firstCommit: number;
}

/**
 * Public extension API returned from activate() (v1.0+).
 * Consumers: `vscode.extensions.getExtension("HernanC.cursorblame").exports`
 *
 * Uses a structural { fsPath: string } shape for URI so that types.ts remains
 * import-free (it must not import "vscode").
 */
export interface CursorBlameApi {
  /**
   * Return the blame info for a specific 0-based line in a file.
   * Returns undefined if the file is not tracked or blame is unavailable.
   */
  getBlameForLine(uri: { fsPath: string }, line: number): BlameInfo | undefined;
}

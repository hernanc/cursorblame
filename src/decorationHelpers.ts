/**
 * Pure helper functions for CursorBlame decorations.
 *
 * This module has NO dependency on the "vscode" API so that every function
 * here can be exercised in a plain Node.js unit-test environment without
 * needing a mock for the VSCode extension host.
 *
 * Dependency: types.ts only.
 */

import type { BlameInfo, BlameConfig } from "./types";

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/**
 * Format a Unix timestamp into a human-readable relative time string.
 * e.g. "3 months ago", "2 days ago", "just now"
 */
export function timeAgo(unixTs: number): string {
  const seconds = Math.floor(Date.now() / 1000) - unixTs;
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} month${months !== 1 ? "s" : ""} ago`;
  }
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

// ---------------------------------------------------------------------------
// Markdown escaping
// ---------------------------------------------------------------------------

/** Escape a string for safe use inside a Markdown context. */
export function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!|]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Annotation formatting
// ---------------------------------------------------------------------------

/**
 * Build the annotation string from the format template and blame info.
 * Tokens: {author}, {timeAgo}, {date}, {summary}, {sha}, {shortSha}
 */
export function formatAnnotation(info: BlameInfo, config: BlameConfig): string {
  const maxLen = Math.max(10, config.maxSummaryLength);
  const summary =
    info.summary.length > maxLen
      ? info.summary.slice(0, maxLen - 1) + "…"
      : info.summary;

  const date = new Date(info.authorTime * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return config.format
    .replace("{author}", info.author)
    .replace("{timeAgo}", timeAgo(info.authorTime))
    .replace("{date}", date)
    .replace("{summary}", summary)
    .replace("{sha}", info.sha)
    .replace("{shortSha}", info.shortSha);
}

/**
 * Build the status bar label string (v0.2+).
 * Format: "$(git-commit) {shortSha} {author}, {timeAgo}"
 */
export function formatStatusBar(info: BlameInfo): string {
  if (info.isUncommitted) {
    return "$(git-commit) Uncommitted";
  }
  return `$(git-commit) ${info.shortSha} ${info.author}, ${timeAgo(info.authorTime)}`;
}

// ---------------------------------------------------------------------------
// Age-based opacity (v0.3)
// ---------------------------------------------------------------------------

/**
 * Map a commit's age to an opacity value in [0.35, 1.0].
 *
 * @param authorTime  Unix timestamp of the commit.
 * @param maxDays     Age (in days) at which opacity reaches its minimum.
 * @returns           A number in [0.35, 1.0].
 */
export function ageToOpacity(authorTime: number, maxDays: number): number {
  const clampedMaxDays = Math.max(1, maxDays);
  const ageSeconds = Date.now() / 1000 - authorTime;
  const ageDays = ageSeconds / 86400;
  const ratio = Math.min(1, Math.max(0, ageDays / clampedMaxDays));
  // Lerp from 1.0 (brand new) down to 0.35 (very old)
  return 1.0 - ratio * 0.65;
}

// ---------------------------------------------------------------------------
// Author colour coding (v0.3)
// ---------------------------------------------------------------------------

/**
 * Derive a stable, deterministic CSS colour for an author from their email.
 * Uses a djb2-style hash mapped to 12 hand-picked muted palette colours.
 *
 * @param authorEmail  The author's email address.
 * @returns            A CSS hex colour string.
 */
export function authorColor(authorEmail: string): string {
  // 12 muted palette colours (low saturation, medium lightness — readable in
  // both dark and light themes).
  const PALETTE = [
    "#7ec8e3", // muted blue
    "#a8d8a8", // muted green
    "#f6c90e", // muted yellow
    "#e8a090", // muted red-pink
    "#b5a0d8", // muted purple
    "#f4a460", // muted orange
    "#70c1b3", // muted teal
    "#f9c74f", // muted gold
    "#90be6d", // muted lime-green
    "#c9ada7", // muted rose
    "#9eb3c2", // muted steel
    "#d4a5a5", // muted salmon
  ];

  // djb2 hash
  let hash = 5381;
  for (let i = 0; i < authorEmail.length; i++) {
    hash = ((hash << 5) + hash) ^ authorEmail.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return PALETTE[hash % PALETTE.length];
}

// ---------------------------------------------------------------------------
// Gutter label (v0.3)
// ---------------------------------------------------------------------------

/**
 * Build a compact gutter annotation: "AB 1a2b3c4d"
 * where "AB" is the author's initials (up to 2 chars) and "1a2b3c4d" is the
 * 8-character short SHA.
 *
 * @param info  Blame data for the line.
 * @returns     A compact string for gutter rendering.
 */
export function formatGutterLabel(info: BlameInfo): string {
  if (info.isUncommitted) {
    return "●● uncommit";
  }
  const initials = info.author
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .slice(0, 2)
    .join("");

  return `${initials} ${info.shortSha}`;
}

// ---------------------------------------------------------------------------
// Gutter recency filter (v1.1)
// ---------------------------------------------------------------------------

/**
 * Returns true if a blame line is "recent" enough to show in gutter-recent mode.
 *
 * @param authorTime     Unix timestamp of the commit.
 * @param recentDays     Maximum age in days to be considered recent. 0 = always true.
 */
export function isRecentLine(authorTime: number, recentDays: number): boolean {
  if (recentDays <= 0) {
    return true;
  }
  const ageSeconds = Date.now() / 1000 - authorTime;
  const ageDays = ageSeconds / 86400;
  return ageDays <= recentDays;
}

// ---------------------------------------------------------------------------
// Annotation theme presets (v1.0)
// ---------------------------------------------------------------------------

/** Built-in annotation theme preset names. */
export type ThemePreset = "minimal" | "verbose" | "heatmap" | "team";

/** Map of preset name → format string used for the inline annotation. */
export const THEME_PRESETS: Record<ThemePreset, string> = {
  minimal: "{shortSha}",
  verbose: "{author} · {date} · {summary}",
  heatmap: "{timeAgo} — {shortSha}",
  team: "{author} [{shortSha}] {timeAgo}",
};

/**
 * Return the format string for a named preset, or undefined if the preset
 * name is not recognised (allows callers to fall back to user config).
 */
export function resolveThemePreset(name: string): string | undefined {
  return THEME_PRESETS[name as ThemePreset];
}

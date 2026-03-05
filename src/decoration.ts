/**
 * Decoration management for CursorBlame.
 *
 * Renders blame information as a non-selectable `after` pseudo-element
 * appended to the end of the current cursor line.  The decoration lives
 * entirely outside the document model and cannot be selected or copied.
 *
 * Click-to-remote: VSCode decorations do not support native click events.
 * We expose the commit URL through the decoration's `hoverMessage` as a
 * Markdown command-link, so hovering over the annotation shows a tooltip
 * with a clickable "Open commit on remote" link.
 */

import * as vscode from "vscode";
import type { BlameInfo, BlameConfig, RemoteInfo } from "./types";
import { commitUrl } from "./remoteUrl";

/** Command ID used to open a commit on the remote. */
export const OPEN_COMMIT_COMMAND = "cursorblame.openCommit";

/** Track which editor currently has a decoration so clearDecoration() can target it. */
let activeEditor: vscode.TextEditor | undefined;

/**
 * Create (or recreate) the decoration type using current config.
 * Must be disposed before recreating to avoid resource leaks.
 */
export function createDecorationType(
  config: BlameConfig
): vscode.TextEditorDecorationType {
  const fg = config.foregroundColor?.trim();

  // Resolve the color value:
  //  - If the user set "theme:<id>", use a ThemeColor
  //  - If the user set a CSS value (e.g. "#888" or "rgba(...)"), use it directly
  //  - Otherwise fall back to the editor's codeLens foreground (muted, theme-aware)
  let color: string | vscode.ThemeColor;
  if (fg && fg.startsWith("theme:")) {
    color = new vscode.ThemeColor(fg.slice(6));
  } else if (fg) {
    color = fg;
  } else {
    color = new vscode.ThemeColor("editorCodeLens.foreground");
  }

  return vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 3em",
      color,
      fontStyle: "italic",
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
}

/**
 * Format a Unix timestamp into a human-readable relative time string.
 * e.g. "3 months ago", "2 days ago", "just now"
 */
function timeAgo(unixTs: number): string {
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

/** Escape a string for safe use inside Markdown. */
function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
}

/**
 * Build the annotation string from the format template and blame info.
 * Tokens: {author}, {timeAgo}, {date}, {summary}, {sha}, {shortSha}
 */
function formatAnnotation(info: BlameInfo, config: BlameConfig): string {
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
 * Build a MarkdownString for the decoration hoverMessage.
 * Includes a clickable command-link to open the commit on the remote.
 *
 * @param info        Blame data for the line.
 * @param remoteInfo  Remote info (may be null if no remote detected).
 * @param sha         The commit SHA (validated before use).
 */
function buildHoverMessage(
  info: BlameInfo,
  remoteInfo: RemoteInfo | null
): vscode.MarkdownString {
  const md = new vscode.MarkdownString("", true);
  md.isTrusted = true; // Required for command:// links

  // Header: short SHA + summary
  md.appendMarkdown(`**${escapeMd(info.shortSha)}** — ${escapeMd(info.summary)}\n\n`);

  // Meta line
  const date = new Date(info.authorTime * 1000).toLocaleString();
  md.appendMarkdown(`*${escapeMd(info.author)}* · ${escapeMd(date)}\n\n`);

  if (!info.isUncommitted) {
    const url = remoteInfo ? commitUrl(remoteInfo, info.sha) : null;
    if (url) {
      // Encode the URL as JSON so the command handler receives it safely.
      const encodedArgs = encodeURIComponent(JSON.stringify([url]));
      md.appendMarkdown(
        `[$(link-external) Open commit on remote](command:${OPEN_COMMIT_COMMAND}?${encodedArgs})`
      );
    } else {
      // Fallback: show the SHA so users can look it up manually.
      md.appendMarkdown(`SHA: \`${escapeMd(info.sha)}\``);
    }
  }

  return md;
}

/**
 * Apply (or update) the blame decoration on the given editor and line.
 *
 * @param editor      The active text editor.
 * @param lineNumber  0-based line number.
 * @param info        Blame data for the line.
 * @param remoteInfo  Remote info (may be null).
 * @param config      Current extension config.
 * @param type        The active TextEditorDecorationType.
 */
export function applyDecoration(
  editor: vscode.TextEditor,
  lineNumber: number,
  info: BlameInfo,
  remoteInfo: RemoteInfo | null,
  config: BlameConfig,
  type: vscode.TextEditorDecorationType
): void {
  const annotation = formatAnnotation(info, config);
  const hoverMessage = buildHoverMessage(info, remoteInfo);

  const line = editor.document.lineAt(lineNumber);
  // Attach the decoration to a zero-width range at the very end of the line
  // content (before any trailing newline).  The `after` CSS pseudo-element
  // then appends the text visually without touching the document.
  const range = new vscode.Range(
    lineNumber,
    line.range.end.character,
    lineNumber,
    line.range.end.character
  );

  const options: vscode.DecorationOptions = {
    range,
    hoverMessage,
    renderOptions: {
      after: {
        contentText: annotation,
      },
    },
  };

  editor.setDecorations(type, [options]);
  activeEditor = editor;
}

/**
 * Clear the blame decoration from the given editor (or active editor if omitted).
 */
export function clearDecoration(
  editor: vscode.TextEditor | undefined,
  type: vscode.TextEditorDecorationType
): void {
  const target = editor ?? activeEditor;
  if (target) {
    target.setDecorations(type, []);
  }
  if (editor === activeEditor || !editor) {
    activeEditor = undefined;
  }
}

/**
 * Dispose the current decoration type and return a new one created from the
 * given config.  Call this when the user changes colour settings.
 */
export function recreateDecorationType(
  old: vscode.TextEditorDecorationType | undefined,
  config: BlameConfig
): vscode.TextEditorDecorationType {
  old?.dispose();
  return createDecorationType(config);
}

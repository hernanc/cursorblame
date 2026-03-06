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
 *
 * Pure formatting helpers are in decorationHelpers.ts (no vscode dependency)
 * so they can be unit-tested without an extension host.
 */

import * as vscode from "vscode";
import type { BlameInfo, BlameConfig, RemoteInfo } from "./types";
import { commitUrl } from "./remoteUrl";
import {
  formatAnnotation,
  formatGutterLabel,
  escapeMd,
  ageToOpacity,
  authorColor,
} from "./decorationHelpers";

/** Command ID used to open a commit on the remote. */
export const OPEN_COMMIT_COMMAND = "cursorblame.openCommit";

/** Track which editor currently has a decoration so clearDecoration() can target it. */
let activeEditor: vscode.TextEditor | undefined;

// ---------------------------------------------------------------------------
// Decoration type factory
// ---------------------------------------------------------------------------

/**
 * Create (or recreate) the inline decoration type using current config.
 * Must be disposed before recreating to avoid resource leaks.
 */
export function createDecorationType(
  config: BlameConfig
): vscode.TextEditorDecorationType {
  const fg = config.foregroundColor?.trim();

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
 * Create the gutter decoration type (v0.3).
 * This is a second decoration type rendered on every line when gutterMode is on.
 * Must be disposed separately from the inline decoration type.
 */
export function createGutterDecorationType(): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    before: {
      margin: "0 0.5em 0 0",
      color: new vscode.ThemeColor("editorCodeLens.foreground"),
      fontStyle: "normal",
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
}

// ---------------------------------------------------------------------------
// Hover message builder
// ---------------------------------------------------------------------------

/**
 * Build a MarkdownString for the decoration hoverMessage.
 * Includes a clickable command-link to open the commit on the remote.
 *
 * @param info            Blame data for the line.
 * @param remoteInfo      Remote info (may be null if no remote detected).
 * @param fullBody        Optional full commit message body (v0.4).
 */
function buildHoverMessage(
  info: BlameInfo,
  remoteInfo: RemoteInfo | null,
  fullBody?: string | null
): vscode.MarkdownString {
  const md = new vscode.MarkdownString("", true);
  md.isTrusted = true; // Required for command:// links

  // Header: short SHA + summary
  md.appendMarkdown(`**${escapeMd(info.shortSha)}** — ${escapeMd(info.summary)}\n\n`);

  // Meta line
  const date = new Date(info.authorTime * 1000).toLocaleString();
  md.appendMarkdown(`*${escapeMd(info.author)}* · ${escapeMd(date)}\n\n`);

  // Full commit body (v0.4) — show if different from summary
  if (fullBody && fullBody !== info.summary && !info.isUncommitted) {
    const firstLine = fullBody.split("\n")[0];
    const bodyRest = fullBody.slice(firstLine.length).trim();
    if (bodyRest) {
      md.appendMarkdown(`---\n\n${escapeMd(bodyRest)}\n\n`);
    }
  }

  if (!info.isUncommitted) {
    const url = remoteInfo ? commitUrl(remoteInfo, info.sha) : null;
    if (url) {
      const encodedArgs = encodeURIComponent(JSON.stringify([url]));
      md.appendMarkdown(
        `[$(link-external) Open commit on remote](command:${OPEN_COMMIT_COMMAND}?${encodedArgs})`
      );
    } else {
      md.appendMarkdown(`SHA: \`${escapeMd(info.sha)}\``);
    }
  }

  return md;
}

// ---------------------------------------------------------------------------
// Apply / clear inline decoration
// ---------------------------------------------------------------------------

/**
 * Resolve the decoration colour, factoring in age-based opacity (v0.3)
 * and per-author colour coding (v0.3).
 */
function resolveColor(
  info: BlameInfo,
  config: BlameConfig
): string | vscode.ThemeColor {
  if (config.authorColors && !info.isUncommitted) {
    const base = authorColor(info.authorEmail || info.author);
    const opacity = config.ageFadeMaxDays > 0
      ? ageToOpacity(info.authorTime, config.ageFadeMaxDays)
      : 1.0;
    // Convert hex to rgba for opacity support
    const r = parseInt(base.slice(1, 3), 16);
    const g = parseInt(base.slice(3, 5), 16);
    const b = parseInt(base.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${opacity.toFixed(2)})`;
  }

  if (config.ageFadeMaxDays > 0 && !info.isUncommitted) {
    const opacity = ageToOpacity(info.authorTime, config.ageFadeMaxDays);
    return `rgba(128,128,128,${opacity.toFixed(2)})`;
  }

  const fg = config.foregroundColor?.trim();
  if (fg && fg.startsWith("theme:")) {
    return new vscode.ThemeColor(fg.slice(6));
  } else if (fg) {
    return fg;
  }
  return new vscode.ThemeColor("editorCodeLens.foreground");
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
 * @param fullBody    Optional full commit body for hover (v0.4).
 */
export function applyDecoration(
  editor: vscode.TextEditor,
  lineNumber: number,
  info: BlameInfo,
  remoteInfo: RemoteInfo | null,
  config: BlameConfig,
  type: vscode.TextEditorDecorationType,
  fullBody?: string | null
): void {
  const annotation = formatAnnotation(info, config);
  const hoverMessage = buildHoverMessage(info, remoteInfo, fullBody);
  const color = resolveColor(info, config);

  const line = editor.document.lineAt(lineNumber);
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
        color,
      },
    },
  };

  editor.setDecorations(type, [options]);
  activeEditor = editor;
}

/**
 * Apply gutter decorations to ALL lines of the file (v0.3 gutterMode).
 *
 * @param editor      The text editor to decorate.
 * @param fileBlame   The complete blame map for this file.
 * @param gutterType  The gutter TextEditorDecorationType.
 */
export function applyGutterDecorations(
  editor: vscode.TextEditor,
  fileBlame: Map<number, BlameInfo>,
  gutterType: vscode.TextEditorDecorationType
): void {
  const decorations: vscode.DecorationOptions[] = [];

  for (const [gitLine, info] of fileBlame) {
    const lineNumber = gitLine - 1; // convert to 0-based
    if (lineNumber < 0 || lineNumber >= editor.document.lineCount) {
      continue;
    }
    const line = editor.document.lineAt(lineNumber);
    const range = new vscode.Range(
      lineNumber,
      line.range.start.character,
      lineNumber,
      line.range.start.character
    );
    decorations.push({
      range,
      renderOptions: {
        before: {
          contentText: formatGutterLabel(info),
        },
      },
    });
  }

  editor.setDecorations(gutterType, decorations);
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

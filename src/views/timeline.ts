/**
 * Timeline view: commit history for the current file (v1.0).
 *
 * Implements a VSCode TreeDataProvider that shows commits for the active file
 * as a scrollable, filterable list in a side panel.
 *
 * Registration (in extension.ts):
 *   const tl = new CommitTimelineProvider(cache);
 *   context.subscriptions.push(
 *     vscode.window.createTreeView("cursorblame.timeline", { treeDataProvider: tl })
 *   );
 */

import * as vscode from "vscode";
import type { BlameInfo, FileBlameMap } from "../types";

// ---------------------------------------------------------------------------
// Tree item
// ---------------------------------------------------------------------------

/** One commit in the timeline list. */
class CommitItem extends vscode.TreeItem {
  constructor(
    readonly info: BlameInfo,
    readonly fileUri: vscode.Uri
  ) {
    // Label: short SHA + first 60 chars of summary
    const label = `${info.shortSha}  ${info.summary.slice(0, 60)}${info.summary.length > 60 ? "…" : ""}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    const date = new Date(info.authorTime * 1000).toLocaleDateString();
    this.description = `${info.author} · ${date}`;
    this.tooltip = new vscode.MarkdownString(
      `**${info.shortSha}** — ${info.summary}\n\n*${info.author}* · ${date}`
    );
    this.iconPath = new vscode.ThemeIcon("git-commit");
    this.contextValue = "commitItem";

    // Command: click opens the commit on remote (handled by openCommit command)
    this.command = {
      command: "cursorblame.openCommit",
      title: "Open Commit on Remote",
      arguments: [undefined], // no URL yet — keyboard shortcut path
    };
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class CommitTimelineProvider
  implements vscode.TreeDataProvider<CommitItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<CommitItem | undefined | null | void>();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Current file URI being shown in the timeline. */
  private currentUri: vscode.Uri | undefined;
  /** Current blame map (sorted unique commits). */
  private commits: BlameInfo[] = [];

  /**
   * Update the timeline with a new blame map.
   * @param uri       The file whose history to show.
   * @param fileBlame The blame map for that file.
   */
  update(uri: vscode.Uri, fileBlame: FileBlameMap): void {
    this.currentUri = uri;

    // Deduplicate commits by SHA, preserve order of first appearance
    const seen = new Set<string>();
    this.commits = [];
    // Iterate by line number order
    const sortedLines = [...fileBlame.keys()].sort((a, b) => a - b);
    for (const line of sortedLines) {
      const info = fileBlame.get(line)!;
      if (!info.isUncommitted && !seen.has(info.sha)) {
        seen.add(info.sha);
        this.commits.push(info);
      }
    }

    // Sort by author time descending (most recent first)
    this.commits.sort((a, b) => b.authorTime - a.authorTime);

    this._onDidChangeTreeData.fire();
  }

  /** Clear the timeline (e.g. when switching to an untracked file). */
  clear(): void {
    this.currentUri = undefined;
    this.commits = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommitItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CommitItem): CommitItem[] {
    if (element) {
      return []; // No children — flat list
    }
    if (!this.currentUri) {
      return [];
    }
    return this.commits.map((info) => new CommitItem(info, this.currentUri!));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

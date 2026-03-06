/**
 * Workspace blame dashboard (v1.0).
 *
 * A tree view listing recently-changed files across the workspace,
 * grouped by repository root. Files are sorted by last-modified date.
 *
 * Registration (in extension.ts):
 *   const db = new WorkspaceDashboardProvider();
 *   context.subscriptions.push(
 *     vscode.window.createTreeView("cursorblame.dashboard", { treeDataProvider: db })
 *   );
 */

import * as vscode from "vscode";
import * as path from "path";
import type { BlameInfo } from "../types";

// ---------------------------------------------------------------------------
// Tree items
// ---------------------------------------------------------------------------

/** A repository root node (expandable). */
class RepoItem extends vscode.TreeItem {
  constructor(
    readonly repoRoot: string,
    readonly files: FileItem[]
  ) {
    super(
      path.basename(repoRoot),
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.description = repoRoot;
    this.tooltip = `Repository: ${repoRoot}`;
    this.iconPath = new vscode.ThemeIcon("source-control");
    this.contextValue = "repoItem";
  }
}

/** A recently-changed file leaf node. */
class FileItem extends vscode.TreeItem {
  constructor(
    readonly filePath: string,
    readonly lastBlame: BlameInfo
  ) {
    super(
      path.basename(filePath),
      vscode.TreeItemCollapsibleState.None
    );
    const date = new Date(lastBlame.authorTime * 1000).toLocaleDateString();
    this.description = `${lastBlame.author} · ${date}`;
    this.tooltip = new vscode.MarkdownString(
      `**${path.basename(filePath)}**\n\n` +
      `*${lastBlame.author}* · ${date}\n\n` +
      `${lastBlame.shortSha} — ${lastBlame.summary}`
    );
    this.iconPath = new vscode.ThemeIcon("file");
    this.resourceUri = vscode.Uri.file(filePath);
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [vscode.Uri.file(filePath)],
    };
    this.contextValue = "fileItem";
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Entry used to build the dashboard. */
export interface DashboardEntry {
  repoRoot: string;
  filePath: string;
  lastBlame: BlameInfo;
}

export class WorkspaceDashboardProvider
  implements vscode.TreeDataProvider<RepoItem | FileItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<RepoItem | FileItem | undefined | null | void>();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Repo root → list of file items sorted by recency. */
  private repos: Map<string, FileItem[]> = new Map();

  /**
   * Update the dashboard with new entries.
   * @param entries  Array of recently-changed file entries.
   */
  update(entries: DashboardEntry[]): void {
    this.repos = new Map();

    // Group by repo root
    for (const entry of entries) {
      const items = this.repos.get(entry.repoRoot) ?? [];
      items.push(new FileItem(entry.filePath, entry.lastBlame));
      this.repos.set(entry.repoRoot, items);
    }

    // Sort each group by lastModified descending
    for (const items of this.repos.values()) {
      items.sort((a, b) => b.lastBlame.authorTime - a.lastBlame.authorTime);
    }

    this._onDidChangeTreeData.fire();
  }

  /** Clear the dashboard. */
  clear(): void {
    this.repos = new Map();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RepoItem | FileItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RepoItem | FileItem): (RepoItem | FileItem)[] {
    if (!element) {
      // Root level: one RepoItem per repository
      return [...this.repos.entries()].map(
        ([root, files]) => new RepoItem(root, files)
      );
    }
    if (element instanceof RepoItem) {
      return element.files;
    }
    return [];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

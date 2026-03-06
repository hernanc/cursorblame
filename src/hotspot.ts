/**
 * Hotspot detection via FileDecorationProvider (v0.5).
 *
 * Files with the highest churn (number of commits) in the last 90 days are
 * flagged in the Explorer with a badge and a tooltip.
 *
 * VSCode API: vscode.FileDecorationProvider (requires vscode ≥ 1.57).
 * The current engines.vscode is "^1.75.0" so this API is available.
 *
 * Registration: this class must be registered via
 *   vscode.window.registerFileDecorationProvider(provider)
 * and the disposable pushed to context.subscriptions.
 */

import * as vscode from "vscode";
import * as path from "path";

/** Threshold above which a file is considered a hotspot. */
const HOTSPOT_THRESHOLD = 3;

/** Maximum number of files decorated as hotspots at once (perf guard). */
const MAX_DECORATED = 200;

export class HotspotProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChangeFileDecorations =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  /** Map of normalised fs-path → commit count in the lookback window. */
  private hotspots: Map<string, number> = new Map();

  /**
   * Update the set of hotspot files.
   * @param churnMap  Output of getHotspotFiles() from gitBlame.ts.
   */
  setHotspots(churnMap: Map<string, number>): void {
    this.hotspots = new Map();
    let count = 0;

    // Sort by churn descending and take the top MAX_DECORATED entries that
    // exceed the threshold.
    const sorted = [...churnMap.entries()]
      .filter(([, n]) => n >= HOTSPOT_THRESHOLD)
      .sort(([, a], [, b]) => b - a);

    for (const [filePath, commits] of sorted) {
      if (count >= MAX_DECORATED) {
        break;
      }
      this.hotspots.set(
        vscode.Uri.file(filePath).toString(),
        commits
      );
      count++;
    }

    // Fire with undefined to re-decorate all URIs
    this._onDidChangeFileDecorations.fire(undefined);
  }

  provideFileDecoration(
    uri: vscode.Uri
  ): vscode.FileDecoration | undefined {
    const commits = this.hotspots.get(uri.toString());
    if (commits === undefined) {
      return undefined;
    }

    const filename = path.basename(uri.fsPath);
    return {
      badge: "🔥",
      tooltip: `Hotspot: ${commits} commit${commits !== 1 ? "s" : ""} in the last 90 days (${filename})`,
      color: new vscode.ThemeColor("list.warningForeground"),
      propagate: false,
    };
  }

  dispose(): void {
    this._onDidChangeFileDecorations.dispose();
  }
}

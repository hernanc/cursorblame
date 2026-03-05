/**
 * CursorBlame – entry point.
 *
 * Lifecycle:
 *  1. On activation: create decoration type, register commands, wire events.
 *  2. On cursor line change: debounce → fetch blame (cache-first) → decorate.
 *  3. On cursor leave line / editor change: clear decoration.
 *  4. On file save / git HEAD change: invalidate cache for that file/repo.
 *  5. On deactivation: dispose everything.
 *
 * Security:
 *  - All git invocations go through gitBlame.ts which uses execFile().
 *  - Command arguments received via URI are parsed as JSON and validated.
 *  - Only https:// URLs are opened via vscode.env.openExternal().
 *  - Extension is disabled in untrusted workspaces.
 */

import * as vscode from "vscode";
import * as path from "path";
import { BlameCache } from "./blameCache";
import {
  applyDecoration,
  clearDecoration,
  createDecorationType,
  OPEN_COMMIT_COMMAND,
  recreateDecorationType,
} from "./decoration";
import { blameFile, getGitHead, getGitRoot } from "./gitBlame";
import {
  clearRemoteCache,
  getRemoteInfo,
  invalidateRemoteCache,
} from "./remoteUrl";
import type { BlameConfig } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readConfig(): BlameConfig {
  const cfg = vscode.workspace.getConfiguration("cursorblame");
  return {
    enabled: cfg.get<boolean>("enabled", true),
    format: cfg.get<string>("format", "{author}, {timeAgo} • {summary}"),
    maxSummaryLength: cfg.get<number>("maxSummaryLength", 60),
    foregroundColor: cfg.get<string>("foregroundColor", ""),
    debounceMs: cfg.get<number>("debounceMs", 150),
    ignoreWhitespace: cfg.get<boolean>("ignoreWhitespace", false),
  };
}

/** Validate that a URL string is safe to open (must be https://). */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const cache = new BlameCache();

/** Per-repo root: the HEAD SHA we last used when priming the cache. */
const headShaByRepo = new Map<string, string>();

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Respect workspace trust.
  if (!vscode.workspace.isTrusted) {
    const disposable = vscode.workspace.onDidGrantWorkspaceTrust(() => {
      disposable.dispose();
      doActivate(context);
    });
    context.subscriptions.push(disposable);
    return;
  }

  doActivate(context);
}

function doActivate(context: vscode.ExtensionContext): void {
  let config = readConfig();
  let decorationType = createDecorationType(config);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Currently displayed SHA (for the openCommit command fallback). */
  let currentSha: string | undefined;
  let currentRepoRoot: string | undefined;

  // -------------------------------------------------------------------------
  // Command: open commit on remote
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand(
      OPEN_COMMIT_COMMAND,
      async (urlOrArgs: string | string[] | undefined) => {
        // When invoked via decoration hoverMessage command-link, vscode passes
        // the decoded arguments array.  When invoked via keyboard shortcut,
        // we fall back to the last-shown SHA + remote.
        let targetUrl: string | undefined;

        if (Array.isArray(urlOrArgs) && urlOrArgs.length > 0) {
          targetUrl = urlOrArgs[0];
        } else if (typeof urlOrArgs === "string") {
          targetUrl = urlOrArgs;
        } else if (currentSha && currentRepoRoot) {
          // Keyboard shortcut path: derive URL from current state.
          const remoteInfo = await getRemoteInfo(currentRepoRoot);
          if (remoteInfo && currentSha) {
            const { commitUrl } = await import("./remoteUrl");
            targetUrl = commitUrl(remoteInfo, currentSha) ?? undefined;
          }
        }

        if (!targetUrl || !isSafeUrl(targetUrl)) {
          vscode.window.showWarningMessage(
            "CursorBlame: No remote commit URL available for this line."
          );
          return;
        }

        await vscode.env.openExternal(vscode.Uri.parse(targetUrl, true));
      }
    )
  );

  // -------------------------------------------------------------------------
  // Command: toggle
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.toggle", () => {
      const cfg = vscode.workspace.getConfiguration("cursorblame");
      const current = cfg.get<boolean>("enabled", true);
      cfg.update("enabled", !current, vscode.ConfigurationTarget.Global);
    })
  );

  // -------------------------------------------------------------------------
  // Core: show blame for the current cursor line
  // -------------------------------------------------------------------------
  async function showBlameForEditor(
    editor: vscode.TextEditor
  ): Promise<void> {
    if (!config.enabled) {
      clearDecoration(editor, decorationType);
      return;
    }

    const doc = editor.document;

    // Skip non-file documents (output channels, untitled, etc.)
    if (doc.uri.scheme !== "file") {
      clearDecoration(editor, decorationType);
      return;
    }

    const filePath = doc.uri.fsPath;
    const lineNumber = editor.selection.active.line; // 0-based

    // git blame uses 1-based line numbers
    const gitLine = lineNumber + 1;

    // Resolve git root
    const repoRoot = await getGitRoot(filePath);
    if (!repoRoot) {
      clearDecoration(editor, decorationType);
      return;
    }

    // Resolve HEAD
    const head = await getGitHead(repoRoot);
    if (!head) {
      clearDecoration(editor, decorationType);
      return;
    }

    // Track HEAD per repo for cache invalidation
    const prevHead = headShaByRepo.get(repoRoot);
    if (prevHead && prevHead !== head) {
      cache.invalidateRepo(repoRoot);
      invalidateRemoteCache(repoRoot);
    }
    headShaByRepo.set(repoRoot, head);

    // Fetch blame (cache-first)
    let fileBlame = cache.get(filePath, head);
    if (!fileBlame) {
      const fresh = await blameFile(filePath, repoRoot, config.ignoreWhitespace);
      if (!fresh) {
        clearDecoration(editor, decorationType);
        return;
      }
      cache.set(filePath, head, fresh);
      fileBlame = fresh;
    }

    const info = fileBlame.get(gitLine);
    if (!info) {
      clearDecoration(editor, decorationType);
      return;
    }

    // Resolve remote info (cached internally in remoteUrl.ts)
    const remoteInfo = await getRemoteInfo(repoRoot);

    // Store for keyboard-shortcut fallback
    currentSha = info.isUncommitted ? undefined : info.sha;
    currentRepoRoot = repoRoot;

    applyDecoration(editor, lineNumber, info, remoteInfo, config, decorationType);
  }

  // -------------------------------------------------------------------------
  // Event: cursor / selection change
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const editor = event.textEditor;

      clearDecoration(editor, decorationType);
      currentSha = undefined;
      currentRepoRoot = undefined;

      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        showBlameForEditor(editor).catch(() => {
          // Suppress errors (e.g. editor closed mid-flight)
        });
      }, config.debounceMs);
    })
  );

  // -------------------------------------------------------------------------
  // Event: active editor change
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      currentSha = undefined;
      currentRepoRoot = undefined;

      if (editor) {
        // Don't clear; the selection-change event will fire momentarily.
        // But we do want to trigger blame for the new editor's current cursor.
        debounceTimer = setTimeout(() => {
          debounceTimer = undefined;
          showBlameForEditor(editor).catch(() => {});
        }, config.debounceMs);
      }
    })
  );

  // -------------------------------------------------------------------------
  // Event: file saved → invalidate that file's cache entry
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.scheme === "file") {
        cache.invalidateFile(doc.uri.fsPath);
      }
    })
  );

  // -------------------------------------------------------------------------
  // Event: configuration changed
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cursorblame")) {
        config = readConfig();
        // Recreate decoration type if colour might have changed.
        decorationType = recreateDecorationType(decorationType, config);

        // Re-render for the active editor immediately.
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          showBlameForEditor(editor).catch(() => {});
        }
      }
    })
  );

  // -------------------------------------------------------------------------
  // Watch .git/HEAD for branch/checkout changes (best-effort)
  // -------------------------------------------------------------------------
  setupHeadWatcher(context, () => {
    cache.clear();
    clearRemoteCache();
    headShaByRepo.clear();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      showBlameForEditor(editor).catch(() => {});
    }
  });

  // -------------------------------------------------------------------------
  // Cleanup on deactivation
  // -------------------------------------------------------------------------
  context.subscriptions.push({
    dispose() {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      decorationType.dispose();
      cache.clear();
      clearRemoteCache();
      headShaByRepo.clear();
    },
  });

  // Trigger for the currently active editor on startup.
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    showBlameForEditor(editor).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Deactivation
// ---------------------------------------------------------------------------

export function deactivate(): void {
  // Individual disposables are cleaned up via context.subscriptions.
}

// ---------------------------------------------------------------------------
// .git/HEAD file watcher
// ---------------------------------------------------------------------------

/**
 * Watch all .git/HEAD files in the workspace to detect branch switches and
 * new commits.  Falls back gracefully if the workspace has no git repos.
 */
function setupHeadWatcher(
  context: vscode.ExtensionContext,
  onHeadChange: () => void
): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  // Use a FileSystemWatcher on .git/HEAD for each workspace root.
  for (const folder of workspaceFolders) {
    const gitHeadPath = path.join(folder.uri.fsPath, ".git", "HEAD");
    const pattern = new vscode.RelativePattern(folder, ".git/HEAD");
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handler = () => onHeadChange();
    watcher.onDidChange(handler);
    watcher.onDidCreate(handler);
    watcher.onDidDelete(handler);

    context.subscriptions.push(watcher);

    // Suppress unused variable warning — gitHeadPath kept for potential logging.
    void gitHeadPath;
  }
}

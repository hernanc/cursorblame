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
 *  - GitHub token is read from SecretStorage — never stored in BlameConfig.
 */

import * as vscode from "vscode";
import * as path from "path";
import { BlameCache } from "./blameCache";
import {
  applyDecoration,
  applyGutterDecorations,
  clearDecoration,
  createDecorationType,
  createGutterDecorationType,
  OPEN_COMMIT_COMMAND,
  recreateDecorationType,
} from "./decoration";
import { formatStatusBar } from "./decorationHelpers";
import {
  blameFile,
  blameFileFollow,
  getCommitBody,
  getGitHead,
  getGitRoot,
  getHotspotFiles,
  isValidSha,
} from "./gitBlame";
import {
  clearRemoteCache,
  commitUrl,
  getRemoteInfo,
  invalidateRemoteCache,
} from "./remoteUrl";
import { lookupPr } from "./prLookup";
import { computeFileStats, formatFileStats } from "./fileStats";
import { HotspotProvider } from "./hotspot";
import { CommitTimelineProvider } from "./views/timeline";
import { WorkspaceDashboardProvider } from "./views/dashboard";
import type {
  BlameConfig,
  BlameMode,
  CursorBlameApi,
  FileBlameMap,
} from "./types";

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
    // v0.2
    mode: cfg.get<BlameMode>("mode", "always"),
    followMerges: cfg.get<boolean>("followMerges", false),
    // v0.3
    ageFadeMaxDays: cfg.get<number>("ageFadeMaxDays", 365),
    gutterMode: cfg.get<boolean>("gutterMode", false),
    authorColors: cfg.get<boolean>("authorColors", false),
    // v0.5
    ignoredAuthors: cfg.get<string[]>("ignoredAuthors", []),
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

/**
 * Apply the ignoredAuthors filter to a FileBlameMap (v0.5).
 * Returns a new Map with entries for ignored authors replaced by undefined
 * (the entry is deleted so the next real commit shows instead).
 */
function applyIgnoredAuthors(
  fileBlame: FileBlameMap,
  ignoredAuthors: string[]
): FileBlameMap {
  if (ignoredAuthors.length === 0) {
    return fileBlame;
  }
  const lower = ignoredAuthors.map((a) => a.toLowerCase());
  const filtered: FileBlameMap = new Map();
  for (const [line, info] of fileBlame) {
    const authorLower = (info.authorEmail || info.author).toLowerCase();
    if (!lower.some((ig) => authorLower.includes(ig))) {
      filtered.set(line, info);
    }
  }
  return filtered;
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

export async function activate(
  context: vscode.ExtensionContext
): Promise<CursorBlameApi> {
  // Respect workspace trust.
  if (!vscode.workspace.isTrusted) {
    const disposable = vscode.workspace.onDidGrantWorkspaceTrust(() => {
      disposable.dispose();
      doActivate(context);
    });
    context.subscriptions.push(disposable);
  } else {
    doActivate(context);
  }

  // Return the public API (v1.0) — callers can use this even before blame data
  // is loaded; getBlameForLine will return undefined in that case.
  const api: CursorBlameApi = {
    getBlameForLine(uri: { fsPath: string }, line: number): import("./types").BlameInfo | undefined {
      // Search the cache for any HEAD that has this file
      const filePath = uri.fsPath;
      for (const [head] of headShaByRepo) {
        const fileBlame = cache.get(filePath, head);
        if (fileBlame) {
          return fileBlame.get(line + 1); // convert 0-based to 1-based
        }
      }
      return undefined;
    },
  };
  return api;
}

function doActivate(context: vscode.ExtensionContext): void {
  let config = readConfig();
  let decorationType = createDecorationType(config);
  let gutterDecorationType: vscode.TextEditorDecorationType | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Track current line to implement "always" mode (v0.2). */
  let lastAnnotatedLine = -1;
  let lastAnnotatedEditor: vscode.TextEditor | undefined;

  /** Currently displayed SHA (for the openCommit command fallback). */
  let currentSha: string | undefined;
  let currentRepoRoot: string | undefined;
  let currentFilePath: string | undefined;

  // ── v0.2: Status bar item ────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.command = OPEN_COMMIT_COMMAND;
  statusBar.tooltip = "Click to open commit on remote";
  context.subscriptions.push(statusBar);

  // ── v1.0: Views ──────────────────────────────────────────────────────────
  const timelineProvider = new CommitTimelineProvider();
  const dashboardProvider = new WorkspaceDashboardProvider();

  context.subscriptions.push(
    vscode.window.createTreeView("cursorblame.timeline", {
      treeDataProvider: timelineProvider,
      showCollapseAll: false,
    }),
    vscode.window.createTreeView("cursorblame.dashboard", {
      treeDataProvider: dashboardProvider,
      showCollapseAll: true,
    })
  );

  // ── v0.5: Hotspot provider ────────────────────────────────────────────────
  const hotspotProvider = new HotspotProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(hotspotProvider)
  );

  // ── Gutter decoration type lifecycle ─────────────────────────────────────
  function ensureGutterType(): vscode.TextEditorDecorationType {
    if (!gutterDecorationType) {
      gutterDecorationType = createGutterDecorationType();
      context.subscriptions.push(gutterDecorationType);
    }
    return gutterDecorationType;
  }

  function clearGutterDecorations(editor: vscode.TextEditor): void {
    if (gutterDecorationType) {
      editor.setDecorations(gutterDecorationType, []);
    }
  }

  // -------------------------------------------------------------------------
  // Command: open commit on remote
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand(
      OPEN_COMMIT_COMMAND,
      async (urlOrArgs: string | string[] | undefined) => {
        let targetUrl: string | undefined;

        if (Array.isArray(urlOrArgs) && urlOrArgs.length > 0) {
          targetUrl = urlOrArgs[0];
        } else if (typeof urlOrArgs === "string") {
          targetUrl = urlOrArgs;
        } else if (currentSha && currentRepoRoot) {
          const remoteInfo = await getRemoteInfo(currentRepoRoot);
          if (remoteInfo && currentSha) {
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

  // ── Command: toggle ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.toggle", () => {
      const cfg = vscode.workspace.getConfiguration("cursorblame");
      const current = cfg.get<boolean>("enabled", true);
      cfg.update("enabled", !current, vscode.ConfigurationTarget.Global);
    })
  );

  // ── Command: copy SHA (v0.2) ─────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.copySha", async () => {
      if (!currentSha) {
        vscode.window.showWarningMessage(
          "CursorBlame: No commit SHA available for the current line."
        );
        return;
      }
      await vscode.env.clipboard.writeText(currentSha);
      vscode.window.showInformationMessage(
        `CursorBlame: Copied ${currentSha.slice(0, 8)} to clipboard.`
      );
    })
  );

  // ── Command: open associated PR/MR (v0.4) ────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.openPr", async () => {
      if (!currentSha || !currentRepoRoot || !isValidSha(currentSha)) {
        vscode.window.showWarningMessage(
          "CursorBlame: No commit SHA available for the current line."
        );
        return;
      }
      const remoteInfo = await getRemoteInfo(currentRepoRoot);
      if (!remoteInfo) {
        vscode.window.showWarningMessage(
          "CursorBlame: No remote repository detected."
        );
        return;
      }
      // Read token from SecretStorage (never from config / BlameConfig)
      const token = await context.secrets.get("cursorblame.githubToken");
      const prUrl = await lookupPr(remoteInfo, currentSha, token);
      if (!prUrl || !isSafeUrl(prUrl)) {
        vscode.window.showInformationMessage(
          "CursorBlame: No pull request found for this commit."
        );
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(prUrl, true));
    })
  );

  // ── Command: set GitHub token (v0.4) ────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.setGithubToken", async () => {
      const token = await vscode.window.showInputBox({
        prompt: "Enter your GitHub Personal Access Token",
        password: true,
        ignoreFocusOut: true,
        placeHolder: "ghp_...",
      });
      if (token === undefined) {
        return; // user cancelled
      }
      if (token === "") {
        await context.secrets.delete("cursorblame.githubToken");
        vscode.window.showInformationMessage("CursorBlame: GitHub token removed.");
      } else {
        await context.secrets.store("cursorblame.githubToken", token);
        vscode.window.showInformationMessage("CursorBlame: GitHub token saved securely.");
      }
    })
  );

  // ── Command: next/prev change (v0.4) ─────────────────────────────────────
  async function navigateChange(direction: "next" | "prev"): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !currentFilePath) {
      return;
    }
    const filePath = editor.document.uri.fsPath;
    const repoRoot = await getGitRoot(filePath);
    if (!repoRoot) {
      return;
    }
    const head = await getGitHead(repoRoot);
    if (!head) {
      return;
    }
    const fileBlame = cache.get(filePath, head);
    if (!fileBlame) {
      return;
    }

    const currentLine = editor.selection.active.line + 1; // 1-based
    const currentInfo = fileBlame.get(currentLine);
    if (!currentInfo || currentInfo.isUncommitted) {
      return;
    }

    const sha = currentInfo.sha;
    const lineCount = editor.document.lineCount;

    // Find all lines sharing the same SHA
    const matchingLines: number[] = [];
    for (let l = 1; l <= lineCount; l++) {
      const info = fileBlame.get(l);
      if (info && info.sha === sha) {
        matchingLines.push(l);
      }
    }

    if (matchingLines.length <= 1) {
      vscode.window.showInformationMessage(
        "CursorBlame: No other lines from the same commit."
      );
      return;
    }

    const currentIdx = matchingLines.indexOf(currentLine);
    let targetIdx: number;
    if (direction === "next") {
      targetIdx = (currentIdx + 1) % matchingLines.length;
    } else {
      targetIdx = (currentIdx - 1 + matchingLines.length) % matchingLines.length;
    }

    const targetLine = matchingLines[targetIdx] - 1; // 0-based for VSCode
    const pos = new vscode.Position(targetLine, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos));
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.nextChange", () =>
      navigateChange("next")
    ),
    vscode.commands.registerCommand("cursorblame.prevChange", () =>
      navigateChange("prev")
    )
  );

  // ── Command: peek diff (v0.4) ─────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.peekDiff", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !currentSha || !isValidSha(currentSha)) {
        return;
      }
      // Open the diff editor for parent commit vs current commit
      // Use the built-in git diff command if the Git extension is active
      try {
        await vscode.commands.executeCommand(
          "git.openChange",
          editor.document.uri
        );
      } catch {
        vscode.window.showInformationMessage(
          "CursorBlame: Diff peek requires the built-in Git extension."
        );
      }
    })
  );

  // ── Command: file stats (v0.5) ────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.fileStats", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const filePath = editor.document.uri.fsPath;
      const repoRoot = await getGitRoot(filePath);
      if (!repoRoot) {
        vscode.window.showWarningMessage(
          "CursorBlame: File is not in a git repository."
        );
        return;
      }
      const head = await getGitHead(repoRoot);
      if (!head) {
        return;
      }
      let fileBlame = cache.get(filePath, head);
      if (!fileBlame) {
        const fresh = await blameFile(filePath, repoRoot, config.ignoreWhitespace, config.followMerges);
        if (!fresh) {
          vscode.window.showWarningMessage(
            "CursorBlame: Could not read blame data for this file."
          );
          return;
        }
        cache.set(filePath, head, fresh);
        fileBlame = fresh;
      }

      const stats = computeFileStats(fileBlame);
      const markdown = formatFileStats(stats, filePath);

      const panel = vscode.window.createWebviewPanel(
        "cursorblame.fileStats",
        `Blame Stats: ${path.basename(filePath)}`,
        vscode.ViewColumn.Beside,
        { enableScripts: false }
      );
      panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
           background: var(--vscode-editor-background); padding: 1rem 2rem; }
    table { border-collapse: collapse; width: 100%; }
    td, th { padding: 4px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
    th { text-align: left; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
<pre>${escapeHtml(markdown)}</pre>
</body>
</html>`;
      context.subscriptions.push(panel);
    })
  );

  // ── Command: refresh hotspots (v0.5) ─────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.refreshHotspots", async () => {
      await refreshHotspots();
    })
  );

  async function refreshHotspots(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return;
    }
    const allChurn = new Map<string, number>();
    for (const folder of folders) {
      const churn = await getHotspotFiles(folder.uri.fsPath, 90);
      for (const [file, count] of churn) {
        allChurn.set(file, (allChurn.get(file) ?? 0) + count);
      }
    }
    hotspotProvider.setHotspots(allChurn);
  }

  // ── Command: show/update dashboard (v1.0) ────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorblame.showDashboard", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.cursorblame-sidebar"
      );
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
      clearGutterDecorations(editor);
      statusBar.hide();
      return;
    }

    const doc = editor.document;

    if (doc.uri.scheme !== "file") {
      clearDecoration(editor, decorationType);
      clearGutterDecorations(editor);
      statusBar.hide();
      return;
    }

    const filePath = doc.uri.fsPath;
    const lineNumber = editor.selection.active.line; // 0-based
    const gitLine = lineNumber + 1; // 1-based

    // Resolve git root — supports monorepo (v0.5): walk up from file, not workspace root
    const repoRoot = await getGitRoot(filePath);
    if (!repoRoot) {
      clearDecoration(editor, decorationType);
      statusBar.hide();
      return;
    }

    const head = await getGitHead(repoRoot);
    if (!head) {
      clearDecoration(editor, decorationType);
      statusBar.hide();
      return;
    }

    // Track HEAD per repo for cache invalidation
    const prevHead = headShaByRepo.get(repoRoot);
    if (prevHead && prevHead !== head) {
      cache.invalidateRepo(repoRoot);
      invalidateRemoteCache(repoRoot);
    }
    headShaByRepo.set(repoRoot, head);

    // Fetch blame (cache-first), respecting followMerges + followRenames (v0.5)
    let rawBlame = cache.get(filePath, head);
    if (!rawBlame) {
      const blameFn = config.ignoredAuthors.length > 0
        ? blameFileFollow  // also try rename follow when ignored authors is set (v0.5)
        : blameFile;
      const fresh = await blameFn(
        filePath,
        repoRoot,
        config.ignoreWhitespace,
        config.followMerges
      );
      if (!fresh) {
        clearDecoration(editor, decorationType);
        statusBar.hide();
        return;
      }
      cache.set(filePath, head, fresh);
      rawBlame = fresh;
    }

    // Apply ignored authors filter (v0.5)
    const fileBlame = applyIgnoredAuthors(rawBlame, config.ignoredAuthors);

    currentFilePath = filePath;

    const info = fileBlame.get(gitLine);
    if (!info) {
      clearDecoration(editor, decorationType);
      statusBar.hide();
      lastAnnotatedLine = -1;
      lastAnnotatedEditor = undefined;
      return;
    }

    // Resolve remote info
    const remoteInfo = await getRemoteInfo(repoRoot);

    // Store for keyboard-shortcut fallback
    currentSha = info.isUncommitted ? undefined : info.sha;
    currentRepoRoot = repoRoot;

    // Fetch full commit body for hover (v0.4) — non-blocking best-effort
    let fullBody: string | null = null;
    if (!info.isUncommitted && isValidSha(info.sha)) {
      fullBody = await getCommitBody(info.sha, repoRoot).catch(() => null);
    }

    applyDecoration(editor, lineNumber, info, remoteInfo, config, decorationType, fullBody);
    lastAnnotatedLine = lineNumber;
    lastAnnotatedEditor = editor;

    // Update status bar (v0.2)
    statusBar.text = formatStatusBar(info);
    statusBar.show();

    // Apply gutter decorations if gutterMode is on (v0.3)
    if (config.gutterMode) {
      applyGutterDecorations(editor, fileBlame, ensureGutterType());
    } else {
      clearGutterDecorations(editor);
    }

    // Update timeline view (v1.0) — only update when file changes
    if (rawBlame.size > 0) {
      timelineProvider.update(doc.uri, fileBlame);
    }
  }

  // ─── Pre-warm cache on file open (v0.2) ──────────────────────────────────
  async function prewarmFile(doc: vscode.TextDocument): Promise<void> {
    if (doc.uri.scheme !== "file") {
      return;
    }
    const filePath = doc.uri.fsPath;
    const repoRoot = await getGitRoot(filePath);
    if (!repoRoot) {
      return;
    }
    const head = await getGitHead(repoRoot);
    if (!head || cache.get(filePath, head)) {
      return; // already cached
    }
    const blame = await blameFile(
      filePath,
      repoRoot,
      config.ignoreWhitespace,
      config.followMerges
    );
    if (blame) {
      cache.set(filePath, head, blame);
    }
  }

  // -------------------------------------------------------------------------
  // Event: cursor / selection change
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const editor = event.textEditor;
      const newLine = editor.selection.active.line;

      // "always" mode: don't clear & redebounce when typing on the same line (v0.2)
      if (
        config.mode === "always" &&
        newLine === lastAnnotatedLine &&
        editor === lastAnnotatedEditor
      ) {
        return;
      }

      clearDecoration(editor, decorationType);
      lastAnnotatedLine = -1;
      lastAnnotatedEditor = undefined;
      currentSha = undefined;
      currentRepoRoot = undefined;
      statusBar.hide();

      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        showBlameForEditor(editor).catch(() => {});
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
      lastAnnotatedLine = -1;
      lastAnnotatedEditor = undefined;
      statusBar.hide();

      if (editor) {
        debounceTimer = setTimeout(() => {
          debounceTimer = undefined;
          showBlameForEditor(editor).catch(() => {});
        }, config.debounceMs);
      }
    })
  );

  // -------------------------------------------------------------------------
  // Event: file saved → invalidate cache entry + pre-warm
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.scheme === "file") {
        cache.invalidateFile(doc.uri.fsPath);
        prewarmFile(doc).catch(() => {});
      }
    })
  );

  // ── Event: file opened → pre-warm cache (v0.2) ───────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      prewarmFile(doc).catch(() => {});
    })
  );

  // -------------------------------------------------------------------------
  // Event: configuration changed
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cursorblame")) {
        config = readConfig();
        decorationType = recreateDecorationType(decorationType, config);

        // Recreate gutter type on config change
        if (gutterDecorationType) {
          gutterDecorationType.dispose();
          gutterDecorationType = undefined;
        }

        const editor = vscode.window.activeTextEditor;
        if (editor) {
          showBlameForEditor(editor).catch(() => {});
        }
      }
    })
  );

  // -------------------------------------------------------------------------
  // Watch .git/HEAD for branch/checkout changes
  // -------------------------------------------------------------------------
  setupHeadWatcher(context, () => {
    cache.clear();
    clearRemoteCache();
    headShaByRepo.clear();
    timelineProvider.clear();
    dashboardProvider.clear();

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      showBlameForEditor(editor).catch(() => {});
    }
  });

  // ── Initial hotspot scan (v0.5) ──────────────────────────────────────────
  refreshHotspots().catch(() => {});

  // -------------------------------------------------------------------------
  // Cleanup on deactivation
  // -------------------------------------------------------------------------
  context.subscriptions.push({
    dispose() {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      decorationType.dispose();
      gutterDecorationType?.dispose();
      statusBar.dispose();
      cache.clear();
      clearRemoteCache();
      headShaByRepo.clear();
      hotspotProvider.dispose();
    },
  });

  // Trigger for the currently active editor on startup.
  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor) {
    showBlameForEditor(initialEditor).catch(() => {});
  }
  // Pre-warm all already-open documents (v0.2)
  for (const doc of vscode.workspace.textDocuments) {
    prewarmFile(doc).catch(() => {});
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

function setupHeadWatcher(
  context: vscode.ExtensionContext,
  onHeadChange: () => void
): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  for (const folder of workspaceFolders) {
    const pattern = new vscode.RelativePattern(folder, ".git/HEAD");
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handler = () => onHeadChange();
    watcher.onDidChange(handler);
    watcher.onDidCreate(handler);
    watcher.onDidDelete(handler);

    context.subscriptions.push(watcher);
  }
}

// ---------------------------------------------------------------------------
// Utility: HTML escaping for webview content
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

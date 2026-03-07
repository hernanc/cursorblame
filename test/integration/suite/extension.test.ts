/**
 * Integration tests for the CursorBlame extension.
 *
 * These tests run inside a real VSCode extension host via @vscode/test-electron.
 * They verify that the extension activates correctly, registers its commands,
 * and that blame actually works end-to-end (v1.2 additions).
 */

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

suite("Extension activation", () => {
  suiteSetup(async () => {
    // Ensure the extension is activated before running tests.
    // onStartupFinished activation means it may not be active yet.
    const ext = vscode.extensions.getExtension("HernanC.cursorblame");
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test("Extension should be present in the extensions list", () => {
    const ext = vscode.extensions.getExtension("HernanC.cursorblame");
    assert.ok(ext, "Extension HernanC.cursorblame should be registered");
  });

  test("cursorblame.openCommit command should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("cursorblame.openCommit"),
      "openCommit command should be registered"
    );
  });

  test("cursorblame.toggle command should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("cursorblame.toggle"),
      "toggle command should be registered"
    );
  });

  test("cursorblame.copySha command should be registered (v0.2)", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("cursorblame.copySha"),
      "copySha command should be registered"
    );
  });

  test("cursorblame.nextChange command should be registered (v0.4)", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("cursorblame.nextChange"),
      "nextChange command should be registered"
    );
  });

  test("cursorblame.prevChange command should be registered (v0.4)", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("cursorblame.prevChange"),
      "prevChange command should be registered"
    );
  });

  test("cursorblame.fileStats command should be registered (v0.5)", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("cursorblame.fileStats"),
      "fileStats command should be registered"
    );
  });

  test("Extension exports the public API (v1.0)", async () => {
    const ext = vscode.extensions.getExtension("HernanC.cursorblame");
    if (!ext) {
      assert.fail("Extension not found");
      return;
    }
    const api = ext.exports;
    assert.ok(api, "Extension should export an API object");
    assert.strictEqual(
      typeof api.getBlameForLine,
      "function",
      "API should expose getBlameForLine()"
    );
  });

  test("Public API getBlameForLine returns undefined for an untracked file", async () => {
    const ext = vscode.extensions.getExtension("HernanC.cursorblame");
    if (!ext) {
      assert.fail("Extension not found");
      return;
    }
    const api = ext.exports;
    // Pass a fake URI that won't be in the cache
    const fakeUri = { fsPath: "/nonexistent/file.ts" };
    const result = api.getBlameForLine(fakeUri, 0);
    assert.strictEqual(
      result,
      undefined,
      "should return undefined for uncached file"
    );
  });
});

// ---------------------------------------------------------------------------
// Real blame assertions (v1.2)
// ---------------------------------------------------------------------------

/**
 * Poll fn() until it returns a truthy value or the timeout elapses.
 * Returns the last value returned by fn().
 */
async function pollUntil<T>(
  fn: () => T,
  opts: { timeoutMs: number; intervalMs: number }
): Promise<T | undefined> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const result = fn();
    if (result) {
      return result;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, opts.intervalMs));
  }
  return undefined;
}

suite("Real blame — end-to-end", () => {
  let ext: vscode.Extension<{ getBlameForLine: (uri: { fsPath: string }, line: number) => unknown }>;
  let packageJsonUri: vscode.Uri;

  suiteSetup(async () => {
    const found = vscode.extensions.getExtension("HernanC.cursorblame");
    if (!found) {
      throw new Error("Extension HernanC.cursorblame not found");
    }
    if (!found.isActive) {
      await found.activate();
    }
    ext = found as typeof ext;

    // Use the extension's own package.json — it is definitely tracked by git.
    // __dirname is test/integration/suite; three levels up is the extension root.
    const extensionRoot = path.join(__dirname, "..", "..", "..");
    packageJsonUri = vscode.Uri.file(path.join(extensionRoot, "package.json"));
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("getBlameForLine returns valid BlameInfo for a committed line", async () => {
    // Open the file and move the cursor to trigger the blame pipeline
    const doc = await vscode.workspace.openTextDocument(packageJsonUri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });

    // Position cursor at line 0
    const pos = new vscode.Position(0, 0);
    editor.selection = new vscode.Selection(pos, pos);

    // Poll until blame resolves (the extension runs git blame async)
    const blameInfo = await pollUntil(
      () => ext.exports.getBlameForLine({ fsPath: packageJsonUri.fsPath }, 0),
      { timeoutMs: 5000, intervalMs: 100 }
    );

    assert.ok(
      blameInfo,
      "getBlameForLine should return a BlameInfo object within 5 seconds"
    );

    const info = blameInfo as {
      sha: string;
      shortSha: string;
      author: string;
      authorTime: number;
      isUncommitted: boolean;
    };

    assert.match(
      info.sha,
      /^[0-9a-f]{40}$/,
      "sha must be a valid 40-character hex string"
    );
    assert.ok(
      info.author.length > 0,
      "author must be a non-empty string"
    );
    assert.ok(
      info.authorTime > 0,
      "authorTime must be a positive Unix timestamp"
    );
    assert.strictEqual(
      info.shortSha.length,
      8,
      "shortSha must be exactly 8 characters"
    );
  });

  test("getBlameForLine returns undefined for a line beyond the file length", async () => {
    const doc = await vscode.workspace.openTextDocument(packageJsonUri);

    // A line number way beyond the end of the file
    const beyondEnd = doc.lineCount + 1000;
    const result = ext.exports.getBlameForLine(
      { fsPath: packageJsonUri.fsPath },
      beyondEnd
    );

    assert.strictEqual(
      result,
      undefined,
      "should return undefined for a line beyond the file"
    );
  });

  test("cursorblame.snooze command is registered (v1.1)", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("cursorblame.snooze"),
      "snooze command should be registered"
    );
  });
});

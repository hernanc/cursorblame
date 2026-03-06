/**
 * Integration tests for the CursorBlame extension.
 *
 * These tests run inside a real VSCode extension host via @vscode/test-electron.
 * They verify that the extension activates correctly and registers its commands.
 */

import * as assert from "assert";
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

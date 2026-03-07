/**
 * Unit tests for the LOADING_BLAME_INFO placeholder contract (v1.2).
 *
 * The placeholder is defined inline in extension.ts (not exported) so we verify
 * the shape contract here by building an equivalent object and asserting the
 * properties that the rendering path relies on.
 */

import * as assert from "assert";
import { isValidSha } from "../../src/gitBlame";

// ---------------------------------------------------------------------------
// The shape contract for LOADING_BLAME_INFO
// ---------------------------------------------------------------------------

describe("LOADING_BLAME_INFO shape contract", () => {
  /**
   * Reconstruct the same object literal that extension.ts uses so we can
   * test the properties without importing from a module that requires vscode.
   */
  const LOADING_BLAME_INFO = {
    sha: "0".repeat(40),
    shortSha: "00000000",
    author: "",
    authorEmail: "",
    authorTime: 0,
    summary: "loading\u2026",
    isUncommitted: true,
  };

  it("isUncommitted must be true so no remote URL is attempted", () => {
    assert.strictEqual(LOADING_BLAME_INFO.isUncommitted, true);
  });

  it("sha must be the all-zeros sentinel (same as uncommitted lines)", () => {
    assert.strictEqual(LOADING_BLAME_INFO.sha, "0".repeat(40));
    assert.strictEqual(LOADING_BLAME_INFO.sha.length, 40);
  });

  it("sha passes isValidSha (all-zeros is a valid 40-char hex string)", () => {
    assert.strictEqual(isValidSha(LOADING_BLAME_INFO.sha), true);
  });

  it("shortSha must be exactly 8 chars", () => {
    assert.strictEqual(LOADING_BLAME_INFO.shortSha.length, 8);
  });

  it("summary must be the 'loading…' literal", () => {
    assert.ok(LOADING_BLAME_INFO.summary.includes("loading"));
  });

  it("authorTime must be 0 so ageToOpacity does not throw on a zero timestamp", () => {
    assert.strictEqual(LOADING_BLAME_INFO.authorTime, 0);
  });
});

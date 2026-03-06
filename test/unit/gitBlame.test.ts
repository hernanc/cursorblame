/**
 * Unit tests for src/gitBlame.ts
 * Tests cover: isValidSha, normalizeFilePath, parsePorcelain
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { isValidSha, normalizeFilePath, parsePorcelain } from "../../src/gitBlame";

// ---------------------------------------------------------------------------
// isValidSha
// ---------------------------------------------------------------------------

describe("isValidSha", () => {
  it("accepts a valid 40-char lowercase hex SHA", () => {
    assert.strictEqual(
      isValidSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      true
    );
  });

  it("accepts a SHA with all zeros (uncommitted)", () => {
    assert.strictEqual(
      isValidSha("0000000000000000000000000000000000000000"),
      true
    );
  });

  it("rejects a SHA that is too short", () => {
    assert.strictEqual(isValidSha("abc123"), false);
  });

  it("rejects a SHA that is too long", () => {
    assert.strictEqual(
      isValidSha("abc1234567890abcdef1234567890abcdef1234567"),
      false
    );
  });

  it("rejects a SHA with uppercase letters", () => {
    assert.strictEqual(
      isValidSha("ABC1234567890ABCDEF1234567890ABCDEF123456"),
      false
    );
  });

  it("rejects a SHA with non-hex characters", () => {
    assert.strictEqual(
      isValidSha("xyz1234567890abcdef1234567890abcdef123456"),
      false
    );
  });

  it("rejects an empty string", () => {
    assert.strictEqual(isValidSha(""), false);
  });

  it("rejects undefined coerced to string", () => {
    // TypeScript won't allow this, but guard anyway
    assert.strictEqual(isValidSha(String(undefined)), false);
  });
});

// ---------------------------------------------------------------------------
// normalizeFilePath
// ---------------------------------------------------------------------------

describe("normalizeFilePath", () => {
  it("returns the same string on POSIX paths", () => {
    const p = "/home/user/projects/repo/src/index.ts";
    assert.strictEqual(normalizeFilePath(p), p);
  });

  it("converts Windows-style backslashes to forward slashes", () => {
    // Simulate a Windows path by manually using backslash sep
    const windowsPath = "C:\\Users\\user\\projects\\repo\\src\\index.ts";
    const result = normalizeFilePath(windowsPath);
    // On all platforms, backslashes in the string should become /
    // (Note: path.sep is / on macOS/Linux, so this test verifies the logic)
    if (path.sep === "\\") {
      assert.strictEqual(result, "C:/Users/user/projects/repo/src/index.ts");
    } else {
      // On POSIX, backslashes are valid filename chars — the function should
      // only convert path.sep, which is /. So the string is unchanged.
      assert.strictEqual(result, windowsPath);
    }
  });

  it("handles an empty string", () => {
    assert.strictEqual(normalizeFilePath(""), "");
  });
});

// ---------------------------------------------------------------------------
// parsePorcelain — helper
// ---------------------------------------------------------------------------

function loadFixture(name: string): string {
  const fixturePath = path.join(__dirname, "..", "fixtures", name);
  return fs.readFileSync(fixturePath, "utf8");
}

// ---------------------------------------------------------------------------
// parsePorcelain — committed lines
// ---------------------------------------------------------------------------

describe("parsePorcelain — committed output", () => {
  let output: string;

  before(() => {
    output = loadFixture("porcelain-github.txt");
  });

  it("parses all three lines", () => {
    const result = parsePorcelain(output);
    assert.strictEqual(result.size, 3);
  });

  it("line 1 has the correct SHA", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.sha, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("line 1 has the correct shortSha (8 chars)", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.shortSha, "aaaaaaaa");
  });

  it("line 1 has correct author", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.author, "Sam Horton");
  });

  it("line 1 has correct authorEmail", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.authorEmail, "sam@example.com");
  });

  it("line 1 has correct authorTime", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.authorTime, 1709596809);
  });

  it("line 1 has correct summary", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.summary, "fix: do not blindly update state");
  });

  it("line 1 is not marked as uncommitted", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.isUncommitted, false);
  });

  it("line 2 shares the same SHA as line 1", () => {
    const result = parsePorcelain(output);
    assert.strictEqual(result.get(1)?.sha, result.get(2)?.sha);
  });

  it("line 3 has a different SHA", () => {
    const result = parsePorcelain(output);
    assert.notStrictEqual(result.get(1)?.sha, result.get(3)?.sha);
  });

  it("line 3 author is Jane Doe", () => {
    const info = parsePorcelain(output).get(3);
    assert.ok(info);
    assert.strictEqual(info.author, "Jane Doe");
  });

  it("line 3 summary is feat: initial component", () => {
    const info = parsePorcelain(output).get(3);
    assert.ok(info);
    assert.strictEqual(info.summary, "feat: initial component");
  });
});

// ---------------------------------------------------------------------------
// parsePorcelain — uncommitted lines
// ---------------------------------------------------------------------------

describe("parsePorcelain — uncommitted output", () => {
  let output: string;

  before(() => {
    output = loadFixture("porcelain-uncommitted.txt");
  });

  it("parses one line", () => {
    const result = parsePorcelain(output);
    assert.strictEqual(result.size, 1);
  });

  it("line 1 is marked as uncommitted", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.isUncommitted, true);
  });

  it("line 1 author is normalised to 'You'", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.author, "You");
  });

  it("line 1 summary is 'Uncommitted changes'", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.summary, "Uncommitted changes");
  });

  it("uncommitted SHA is the all-zeros SHA", () => {
    const info = parsePorcelain(output).get(1);
    assert.ok(info);
    assert.strictEqual(info.sha, "0000000000000000000000000000000000000000");
  });
});

// ---------------------------------------------------------------------------
// parsePorcelain — edge cases
// ---------------------------------------------------------------------------

describe("parsePorcelain — edge cases", () => {
  it("returns an empty map for empty input", () => {
    const result = parsePorcelain("");
    assert.strictEqual(result.size, 0);
  });

  it("returns an empty map for input with no hunk headers", () => {
    const result = parsePorcelain("this is not porcelain output\n");
    assert.strictEqual(result.size, 0);
  });

  it("ignores a line with an invalid SHA line", () => {
    const result = parsePorcelain("not-a-sha 1 1 1\n\t content\n");
    assert.strictEqual(result.size, 0);
  });

  it("handles a file with many lines without errors", () => {
    // Build synthetic porcelain for 100 lines using the same commit
    const sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let output = "";
    for (let i = 1; i <= 100; i++) {
      output += `${sha} ${i} ${i} 1\n`;
      output += `author Test\n`;
      output += `author-mail <test@test.com>\n`;
      output += `author-time 1700000000\n`;
      output += `author-tz +0000\n`;
      output += `committer Test\n`;
      output += `committer-mail <test@test.com>\n`;
      output += `committer-time 1700000000\n`;
      output += `committer-tz +0000\n`;
      output += `summary chore: test\n`;
      output += `filename test.ts\n`;
      output += `\tline content\n`;
    }
    const result = parsePorcelain(output);
    assert.strictEqual(result.size, 100);
  });
});

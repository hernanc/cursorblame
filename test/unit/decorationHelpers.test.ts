/**
 * Unit tests for src/decorationHelpers.ts
 * Tests cover: timeAgo, escapeMd, formatAnnotation, formatStatusBar,
 *              ageToOpacity, authorColor, formatGutterLabel,
 *              THEME_PRESETS, resolveThemePreset
 *
 * v0.2: formatStatusBar
 * v0.3: ageToOpacity, authorColor, formatGutterLabel
 * v1.0: THEME_PRESETS, resolveThemePreset
 */

import * as assert from "assert";
import * as sinon from "sinon";
import {
  timeAgo,
  escapeMd,
  formatAnnotation,
  formatStatusBar,
  ageToOpacity,
  authorColor,
  formatGutterLabel,
  THEME_PRESETS,
  resolveThemePreset,
  isRecentLine,
} from "../../src/decorationHelpers";
import type { BlameInfo, BlameConfig } from "../../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInfo(overrides: Partial<BlameInfo> = {}): BlameInfo {
  return {
  sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  shortSha: "aaaaaaaa",
    author: "Sam Horton",
    authorEmail: "sam@example.com",
    authorTime: 1709596809,
    summary: "fix: do not blindly update state",
    isUncommitted: false,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<BlameConfig> = {}): BlameConfig {
  return {
    enabled: true,
    format: "{author}, {timeAgo} • {summary}",
    maxSummaryLength: 60,
    foregroundColor: "",
    debounceMs: 150,
    ignoreWhitespace: false,
    mode: "always",
    followMerges: false,
    ageFadeMaxDays: 365,
    gutterMode: false,
    authorColors: false,
    ignoredAuthors: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// timeAgo
// ---------------------------------------------------------------------------

describe("timeAgo", () => {
  let clock: sinon.SinonFakeTimers;

  // Fix "now" to a known timestamp so tests are deterministic
  const NOW_UNIX = 1710000000; // arbitrary fixed epoch

  before(() => {
    clock = sinon.useFakeTimers({ now: NOW_UNIX * 1000, toFake: ["Date"] });
  });

  after(() => {
    clock.restore();
  });

  it("returns 'just now' for 30 seconds ago", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 30), "just now");
  });

  it("returns 'just now' for exactly 0 seconds ago", () => {
    assert.strictEqual(timeAgo(NOW_UNIX), "just now");
  });

  it("returns '1 minute ago' for 60 seconds ago", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 60), "1 minute ago");
  });

  it("returns '5 minutes ago'", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 5 * 60), "5 minutes ago");
  });

  it("returns '1 hour ago' for 60 minutes ago", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 60 * 60), "1 hour ago");
  });

  it("returns '3 hours ago'", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 3 * 60 * 60), "3 hours ago");
  });

  it("returns '1 day ago' for 24 hours ago", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 24 * 60 * 60), "1 day ago");
  });

  it("returns '10 days ago'", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 10 * 24 * 60 * 60), "10 days ago");
  });

  it("returns '1 month ago' for 30 days ago", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 30 * 24 * 60 * 60), "1 month ago");
  });

  it("returns '6 months ago'", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 6 * 30 * 24 * 60 * 60), "6 months ago");
  });

  it("returns '1 year ago' for 12 months ago", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 12 * 30 * 24 * 60 * 60), "1 year ago");
  });

  it("returns '2 years ago'", () => {
    assert.strictEqual(timeAgo(NOW_UNIX - 2 * 365 * 24 * 60 * 60), "2 years ago");
  });
});

// ---------------------------------------------------------------------------
// escapeMd
// ---------------------------------------------------------------------------

describe("escapeMd", () => {
  it("escapes backslashes", () => {
    assert.strictEqual(escapeMd("a\\b"), "a\\\\b");
  });

  it("escapes backticks", () => {
    assert.strictEqual(escapeMd("`code`"), "\\`code\\`");
  });

  it("escapes asterisks", () => {
    assert.strictEqual(escapeMd("**bold**"), "\\*\\*bold\\*\\*");
  });

  it("escapes underscores", () => {
    assert.strictEqual(escapeMd("_italic_"), "\\_italic\\_");
  });

  it("escapes square brackets", () => {
    assert.strictEqual(escapeMd("[link]"), "\\[link\\]");
  });

  it("escapes parentheses", () => {
    assert.strictEqual(escapeMd("(text)"), "\\(text\\)");
  });

  it("escapes hash", () => {
    assert.strictEqual(escapeMd("# heading"), "\\# heading");
  });

  it("does not alter plain alphanumeric text", () => {
    assert.strictEqual(escapeMd("hello world 123"), "hello world 123");
  });

  it("handles an empty string", () => {
    assert.strictEqual(escapeMd(""), "");
  });

  it("prevents Markdown injection via commit summary", () => {
    const malicious = "[Click me](http://evil.com)";
    const escaped = escapeMd(malicious);
    assert.ok(!escaped.includes("](http"), "injection should be escaped");
  });
});

// ---------------------------------------------------------------------------
// formatAnnotation
// ---------------------------------------------------------------------------

describe("formatAnnotation", () => {
  it("substitutes all tokens in the default format", () => {
    const clock = sinon.useFakeTimers({ now: 1710000000 * 1000, toFake: ["Date"] });
    try {
      const info = makeInfo();
      const config = makeConfig();
      const result = formatAnnotation(info, config);
      assert.ok(result.includes("Sam Horton"), "should include author");
      assert.ok(result.includes("ago"), "should include timeAgo");
      assert.ok(result.includes("fix: do not blindly"), "should include summary");
    } finally {
      clock.restore();
    }
  });

  it("truncates summary longer than maxSummaryLength", () => {
    const longSummary = "a".repeat(100);
    const info = makeInfo({ summary: longSummary });
    const config = makeConfig({ maxSummaryLength: 20, format: "{summary}" });
    const result = formatAnnotation(info, config);
    assert.ok(result.endsWith("…"), "should end with ellipsis");
    assert.ok(result.length <= 21, "should be at most maxSummaryLength + ellipsis");
  });

  it("does not truncate summary shorter than maxSummaryLength", () => {
    const info = makeInfo({ summary: "short" });
    const config = makeConfig({ maxSummaryLength: 60, format: "{summary}" });
    assert.strictEqual(formatAnnotation(info, config), "short");
  });

  it("substitutes {sha} with the full SHA", () => {
    const info = makeInfo();
    const config = makeConfig({ format: "{sha}" });
    assert.strictEqual(
      formatAnnotation(info, config),
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
  });

  it("substitutes {shortSha} with the 8-char SHA", () => {
    const info = makeInfo();
    const config = makeConfig({ format: "{shortSha}" });
    assert.strictEqual(formatAnnotation(info, config), "aaaaaaaa");
  });

  it("substitutes {date} with a date string", () => {
    const info = makeInfo({ authorTime: 1700000000 });
    const config = makeConfig({ format: "{date}" });
    const result = formatAnnotation(info, config);
    // Should be a non-empty string representing a date
    assert.ok(result.length > 0);
  });

  it("enforces minimum maxSummaryLength of 10", () => {
    const info = makeInfo({ summary: "x".repeat(100) });
    const config = makeConfig({ maxSummaryLength: 3, format: "{summary}" });
    // min is enforced at 10 internally
    const result = formatAnnotation(info, config);
    assert.ok(result.length <= 11); // 10 chars + ellipsis
  });
});

// ---------------------------------------------------------------------------
// formatStatusBar (v0.2)
// ---------------------------------------------------------------------------

describe("formatStatusBar", () => {
  it("includes the short SHA and author for a committed line", () => {
    const clock = sinon.useFakeTimers({ now: 1710000000 * 1000, toFake: ["Date"] });
    try {
      const info = makeInfo();
      const result = formatStatusBar(info);
      assert.ok(result.includes("$(git-commit)"), "should include icon");
      assert.ok(result.includes("aaaaaaaa"), "should include short SHA");
      assert.ok(result.includes("Sam Horton"), "should include author");
    } finally {
      clock.restore();
    }
  });

  it("returns a special label for uncommitted lines", () => {
    const info = makeInfo({ isUncommitted: true });
    const result = formatStatusBar(info);
    assert.ok(result.includes("Uncommitted"));
  });
});

// ---------------------------------------------------------------------------
// ageToOpacity (v0.3)
// ---------------------------------------------------------------------------

describe("ageToOpacity", () => {
  it("returns ~1.0 for a brand-new commit (0 days old)", () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const opacity = ageToOpacity(nowUnix, 365);
    assert.ok(Math.abs(opacity - 1.0) < 0.01, `expected ~1.0, got ${opacity}`);
  });

  it("returns 0.35 for a commit exactly at maxDays", () => {
    const maxDays = 365;
    const nowUnix = Math.floor(Date.now() / 1000);
    const old = nowUnix - maxDays * 86400;
    const opacity = ageToOpacity(old, maxDays);
    assert.ok(Math.abs(opacity - 0.35) < 0.01, `expected ~0.35, got ${opacity}`);
  });

  it("clamps opacity to minimum 0.35 beyond maxDays", () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const veryOld = nowUnix - 1000 * 86400; // way beyond any maxDays
    const opacity = ageToOpacity(veryOld, 365);
    assert.ok(opacity >= 0.35, `expected >= 0.35, got ${opacity}`);
  });

  it("returns ~0.675 for a commit at half of maxDays", () => {
    const maxDays = 100;
    const nowUnix = Math.floor(Date.now() / 1000);
    const halfOld = nowUnix - 50 * 86400;
    const opacity = ageToOpacity(halfOld, maxDays);
    // At ratio 0.5: 1.0 - 0.5 * 0.65 = 0.675
    assert.ok(Math.abs(opacity - 0.675) < 0.02, `expected ~0.675, got ${opacity}`);
  });

  it("handles maxDays of 1 without dividing by zero", () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    assert.doesNotThrow(() => ageToOpacity(nowUnix - 86400, 1));
  });

  it("handles maxDays of 0 (clamped to 1 internally)", () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    assert.doesNotThrow(() => ageToOpacity(nowUnix, 0));
  });
});

// ---------------------------------------------------------------------------
// authorColor (v0.3)
// ---------------------------------------------------------------------------

describe("authorColor", () => {
  it("returns a CSS hex colour string", () => {
    const color = authorColor("sam@example.com");
    assert.ok(/^#[0-9a-f]{6}$/.test(color), `expected #rrggbb, got ${color}`);
  });

  it("is stable: same input always produces same output", () => {
    const email = "jane@example.com";
    assert.strictEqual(authorColor(email), authorColor(email));
  });

  it("produces different colors for different emails (probabilistic)", () => {
    const colors = new Set<string>();
    const emails = [
      "alice@a.com",
      "bob@b.com",
      "carol@c.com",
      "dave@d.com",
      "eve@e.com",
    ];
    for (const email of emails) {
      colors.add(authorColor(email));
    }
    // With 5 inputs and 12 palette entries, we expect at least 2 distinct colours
    assert.ok(colors.size >= 2, "should produce at least 2 distinct colours");
  });

  it("handles an empty string without throwing", () => {
    assert.doesNotThrow(() => authorColor(""));
  });
});

// ---------------------------------------------------------------------------
// formatGutterLabel (v0.3)
// ---------------------------------------------------------------------------

describe("formatGutterLabel", () => {
  it("formats initials + short SHA for a committed line", () => {
    const info = makeInfo({ author: "Sam Horton" });
    const label = formatGutterLabel(info);
    assert.ok(label.includes("SH"), "should include initials");
    assert.ok(label.includes("aaaaaaaa"), "should include short SHA");
  });

  it("formats single-word author with one initial", () => {
    const info = makeInfo({ author: "Alice" });
    const label = formatGutterLabel(info);
    assert.ok(label.startsWith("A "), "single initial");
  });

  it("formats three-word author with only first two initials", () => {
    const info = makeInfo({ author: "Jean Claude Van" });
    const label = formatGutterLabel(info);
    assert.ok(label.startsWith("JC "), "first two initials only");
  });

  it("returns a special label for uncommitted lines", () => {
    const info = makeInfo({ isUncommitted: true });
    const label = formatGutterLabel(info);
    assert.ok(label.includes("uncommit"));
  });
});

// ---------------------------------------------------------------------------
// THEME_PRESETS + resolveThemePreset (v1.0)
// ---------------------------------------------------------------------------

describe("THEME_PRESETS", () => {
  it("defines all four built-in presets", () => {
    const names = ["minimal", "verbose", "heatmap", "team"] as const;
    for (const name of names) {
      assert.ok(
        typeof THEME_PRESETS[name] === "string" && THEME_PRESETS[name].length > 0,
        `preset '${name}' should be a non-empty string`
      );
    }
  });

  it("'minimal' preset contains {shortSha}", () => {
    assert.ok(THEME_PRESETS.minimal.includes("{shortSha}"));
  });

  it("'verbose' preset contains {author} and {date}", () => {
    assert.ok(THEME_PRESETS.verbose.includes("{author}"));
    assert.ok(THEME_PRESETS.verbose.includes("{date}"));
  });

  it("all presets contain at least one valid token", () => {
    const validTokens = ["{author}", "{timeAgo}", "{date}", "{summary}", "{sha}", "{shortSha}"];
    for (const [name, fmt] of Object.entries(THEME_PRESETS)) {
      const hasToken = validTokens.some((t) => fmt.includes(t));
      assert.ok(hasToken, `preset '${name}' should contain at least one valid token`);
    }
  });
});

describe("resolveThemePreset", () => {
  it("returns the format string for a known preset", () => {
    const result = resolveThemePreset("minimal");
    assert.strictEqual(result, THEME_PRESETS.minimal);
  });

  it("returns undefined for an unknown preset name", () => {
    assert.strictEqual(resolveThemePreset("nonexistent"), undefined);
  });

  it("returns undefined for an empty string", () => {
    assert.strictEqual(resolveThemePreset(""), undefined);
  });
});

// ---------------------------------------------------------------------------
// fileStats tests (v0.5)
// ---------------------------------------------------------------------------
import { computeFileStats, formatFileStats } from "../../src/fileStats";
import type { FileBlameMap } from "../../src/types";

function makeBlameMap(lines: Array<{ sha: string; author: string; authorEmail: string; authorTime: number }>): FileBlameMap {
  const map: FileBlameMap = new Map();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    map.set(i + 1, {
      sha: l.sha,
      shortSha: l.sha.slice(0, 8),
      author: l.author,
      authorEmail: l.authorEmail,
      authorTime: l.authorTime,
      summary: "test",
      isUncommitted: false,
    });
  }
  return map;
}

describe("computeFileStats", () => {
  it("returns zero totalCommits for an empty map", () => {
    const stats = computeFileStats(new Map());
    assert.strictEqual(stats.totalCommits, 0);
    assert.strictEqual(stats.topAuthors.length, 0);
  });

  it("counts unique commit SHAs correctly", () => {
    const sha1 = "a".repeat(40);
    const sha2 = "b".repeat(40);
    const map = makeBlameMap([
      { sha: sha1, author: "Alice", authorEmail: "alice@test.com", authorTime: 1000 },
      { sha: sha1, author: "Alice", authorEmail: "alice@test.com", authorTime: 1000 },
      { sha: sha2, author: "Bob", authorEmail: "bob@test.com", authorTime: 2000 },
    ]);
    const stats = computeFileStats(map);
    assert.strictEqual(stats.totalCommits, 2);
  });

  it("ranks authors by lines contributed", () => {
    const sha = "a".repeat(40);
    const map = makeBlameMap([
      { sha, author: "Alice", authorEmail: "alice@test.com", authorTime: 1000 },
      { sha: "b".repeat(40), author: "Bob", authorEmail: "bob@test.com", authorTime: 2000 },
      { sha: "c".repeat(40), author: "Alice", authorEmail: "alice@test.com", authorTime: 3000 },
    ]);
    const stats = computeFileStats(map);
    assert.strictEqual(stats.topAuthors[0].author, "Alice");
    assert.strictEqual(stats.topAuthors[0].lines, 2);
  });

  it("tracks lastModified as the most recent authorTime", () => {
    const map = makeBlameMap([
      { sha: "a".repeat(40), author: "A", authorEmail: "a@t.com", authorTime: 1000 },
      { sha: "b".repeat(40), author: "B", authorEmail: "b@t.com", authorTime: 5000 },
    ]);
    const stats = computeFileStats(map);
    assert.strictEqual(stats.lastModified, 5000);
  });

  it("tracks firstCommit as the oldest authorTime", () => {
    const map = makeBlameMap([
      { sha: "a".repeat(40), author: "A", authorEmail: "a@t.com", authorTime: 1000 },
      { sha: "b".repeat(40), author: "B", authorEmail: "b@t.com", authorTime: 5000 },
    ]);
    const stats = computeFileStats(map);
    assert.strictEqual(stats.firstCommit, 1000);
  });

  it("ignores uncommitted lines", () => {
    const map: FileBlameMap = new Map();
    map.set(1, {
      sha: "0".repeat(40),
      shortSha: "00000000",
      author: "You",
      authorEmail: "",
      authorTime: 9999,
      summary: "Uncommitted changes",
      isUncommitted: true,
    });
    const stats = computeFileStats(map);
    assert.strictEqual(stats.totalCommits, 0);
    assert.strictEqual(stats.topAuthors.length, 0);
  });
});

describe("formatFileStats", () => {
  it("produces a non-empty Markdown string", () => {
    const sha = "a".repeat(40);
    const map = makeBlameMap([
      { sha, author: "Alice", authorEmail: "alice@test.com", authorTime: 1700000000 },
    ]);
    const stats = computeFileStats(map);
    const result = formatFileStats(stats, "/repo/src/index.ts");
    assert.ok(result.length > 0);
    assert.ok(result.includes("index.ts"));
    assert.ok(result.includes("Alice"));
  });
});

// ---------------------------------------------------------------------------
// isRecentLine (v1.1)
// ---------------------------------------------------------------------------

describe("isRecentLine", () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    // Fix "now" to a known timestamp so tests are deterministic
    clock = sinon.useFakeTimers({ now: new Date("2026-01-15T12:00:00Z").getTime() });
  });

  afterEach(() => {
    clock.restore();
  });

  const nowSeconds = () => Math.floor(new Date("2026-01-15T12:00:00Z").getTime() / 1000);

  it("returns true when recentDays is 0 (disabled), regardless of age", () => {
    const veryOld = nowSeconds() - 365 * 86400;
    assert.strictEqual(isRecentLine(veryOld, 0), true);
  });

  it("returns true for a commit made today", () => {
    const today = nowSeconds() - 60; // 1 minute ago
    assert.strictEqual(isRecentLine(today, 30), true);
  });

  it("returns true for a commit exactly at the boundary", () => {
    const exactly30DaysAgo = nowSeconds() - 30 * 86400;
    assert.strictEqual(isRecentLine(exactly30DaysAgo, 30), true);
  });

  it("returns false for a commit one second past the boundary", () => {
    const justOver30Days = nowSeconds() - 30 * 86400 - 1;
    assert.strictEqual(isRecentLine(justOver30Days, 30), false);
  });

  it("returns false for a commit well outside the window", () => {
    const oneYearAgo = nowSeconds() - 365 * 86400;
    assert.strictEqual(isRecentLine(oneYearAgo, 7), false);
  });

  it("returns true for a commit within a 1-day window", () => {
    const twelveHoursAgo = nowSeconds() - 12 * 3600;
    assert.strictEqual(isRecentLine(twelveHoursAgo, 1), true);
  });

  it("handles a negative recentDays value like 0 (show all)", () => {
    const veryOld = nowSeconds() - 365 * 86400;
    assert.strictEqual(isRecentLine(veryOld, -1), true);
  });
});

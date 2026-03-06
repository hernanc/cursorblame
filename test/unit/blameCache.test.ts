/**
 * Unit tests for src/blameCache.ts
 * Tests cover: get/set, LRU eviction, invalidateFile, invalidateRepo, clear
 */

import * as assert from "assert";
import { BlameCache } from "../../src/blameCache";
import type { FileBlameMap, BlameInfo } from "../../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInfo(sha: string, author = "Test"): BlameInfo {
  return {
    sha,
    shortSha: sha.slice(0, 8),
    author,
    authorEmail: `${author.toLowerCase().replace(/\s/g, ".")}@test.com`,
    authorTime: 1700000000,
    summary: "test commit",
    isUncommitted: false,
  };
}

function makeBlame(sha: string): FileBlameMap {
  const map: FileBlameMap = new Map();
  map.set(1, makeInfo(sha));
  return map;
}

const HEAD1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEAD2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FILE1 = "/repo/src/file1.ts";
const FILE2 = "/repo/src/file2.ts";

// ---------------------------------------------------------------------------
// get / set
// ---------------------------------------------------------------------------

describe("BlameCache — get/set", () => {
  it("returns undefined on cache miss", () => {
    const cache = new BlameCache();
    assert.strictEqual(cache.get(FILE1, HEAD1), undefined);
  });

  it("returns the stored blame map on cache hit", () => {
    const cache = new BlameCache();
    const blame = makeBlame(HEAD1);
    cache.set(FILE1, HEAD1, blame);
    assert.strictEqual(cache.get(FILE1, HEAD1), blame);
  });

  it("returns undefined when the HEAD changes (different key)", () => {
    const cache = new BlameCache();
    cache.set(FILE1, HEAD1, makeBlame(HEAD1));
    assert.strictEqual(cache.get(FILE1, HEAD2), undefined);
  });

  it("cache miss for a different file", () => {
    const cache = new BlameCache();
    cache.set(FILE1, HEAD1, makeBlame(HEAD1));
    assert.strictEqual(cache.get(FILE2, HEAD1), undefined);
  });

  it("overwriting a key updates the stored value", () => {
    const cache = new BlameCache();
    const blame1 = makeBlame(HEAD1);
    const blame2 = makeBlame(HEAD2);
    cache.set(FILE1, HEAD1, blame1);
    cache.set(FILE1, HEAD1, blame2);
    assert.strictEqual(cache.get(FILE1, HEAD1), blame2);
  });
});

// ---------------------------------------------------------------------------
// LRU eviction
// ---------------------------------------------------------------------------

describe("BlameCache — LRU eviction", () => {
  it("evicts the oldest entry when over capacity", () => {
    const cache = new BlameCache(3);
    cache.set(FILE1, HEAD1, makeBlame(HEAD1)); // oldest
    cache.set(FILE1, HEAD2, makeBlame(HEAD2));
    cache.set(FILE2, HEAD1, makeBlame(HEAD1));
    // Adding a 4th entry should evict the first
    cache.set(FILE2, HEAD2, makeBlame(HEAD2));

    assert.strictEqual(cache.get(FILE1, HEAD1), undefined, "oldest should be evicted");
    assert.ok(cache.get(FILE2, HEAD2), "newest should still be in cache");
  });

  it("touching an entry promotes it to MRU, protecting it from eviction", () => {
    const cache = new BlameCache(3);
    cache.set(FILE1, HEAD1, makeBlame(HEAD1)); // would be LRU
    cache.set(FILE1, HEAD2, makeBlame(HEAD2));
    cache.set(FILE2, HEAD1, makeBlame(HEAD1));

    // Touch the oldest entry — it becomes MRU
    cache.get(FILE1, HEAD1);

    // Now FILE1/HEAD2 is the oldest
    cache.set(FILE2, HEAD2, makeBlame(HEAD2)); // triggers eviction

    assert.ok(cache.get(FILE1, HEAD1), "touched entry should survive");
    assert.strictEqual(cache.get(FILE1, HEAD2), undefined, "untouched LRU should be evicted");
  });

  it("respects a custom maxEntries value of 1", () => {
    const cache = new BlameCache(1);
    cache.set(FILE1, HEAD1, makeBlame(HEAD1));
    cache.set(FILE2, HEAD1, makeBlame(HEAD1)); // should evict FILE1
    assert.strictEqual(cache.get(FILE1, HEAD1), undefined);
    assert.ok(cache.get(FILE2, HEAD1));
  });
});

// ---------------------------------------------------------------------------
// invalidateFile
// ---------------------------------------------------------------------------

describe("BlameCache — invalidateFile", () => {
  it("removes all entries for the given file path", () => {
    const cache = new BlameCache();
    cache.set(FILE1, HEAD1, makeBlame(HEAD1));
    cache.set(FILE1, HEAD2, makeBlame(HEAD2));
    cache.set(FILE2, HEAD1, makeBlame(HEAD1));

    cache.invalidateFile(FILE1);

    assert.strictEqual(cache.get(FILE1, HEAD1), undefined);
    assert.strictEqual(cache.get(FILE1, HEAD2), undefined);
    assert.ok(cache.get(FILE2, HEAD1), "other file should not be affected");
  });

  it("is a no-op when the file is not cached", () => {
    const cache = new BlameCache();
    // Should not throw
    cache.invalidateFile(FILE1);
  });
});

// ---------------------------------------------------------------------------
// invalidateRepo
// ---------------------------------------------------------------------------

describe("BlameCache — invalidateRepo", () => {
  it("removes all entries whose key starts with the repo root", () => {
    const cache = new BlameCache();
    const REPO = "/repo";
    cache.set(`${REPO}/src/a.ts`, HEAD1, makeBlame(HEAD1));
    cache.set(`${REPO}/src/b.ts`, HEAD1, makeBlame(HEAD1));
    cache.set("/other-repo/src/c.ts", HEAD1, makeBlame(HEAD1));

    cache.invalidateRepo(REPO);

    assert.strictEqual(cache.get(`${REPO}/src/a.ts`, HEAD1), undefined);
    assert.strictEqual(cache.get(`${REPO}/src/b.ts`, HEAD1), undefined);
    assert.ok(
      cache.get("/other-repo/src/c.ts", HEAD1),
      "file from another repo should not be evicted"
    );
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe("BlameCache — clear", () => {
  it("removes all cached entries", () => {
    const cache = new BlameCache();
    cache.set(FILE1, HEAD1, makeBlame(HEAD1));
    cache.set(FILE2, HEAD2, makeBlame(HEAD2));

    cache.clear();

    assert.strictEqual(cache.get(FILE1, HEAD1), undefined);
    assert.strictEqual(cache.get(FILE2, HEAD2), undefined);
  });

  it("is a no-op on an empty cache", () => {
    const cache = new BlameCache();
    // Should not throw
    cache.clear();
  });
});

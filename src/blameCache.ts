/**
 * Per-file LRU blame cache.
 *
 * Cache key: `{absoluteFilePath}::{gitHead}` so that cache entries are
 * automatically stale once HEAD advances (new commit, checkout, etc.).
 *
 * Eviction: simple LRU with a configurable max entry count.
 */

import type { FileBlameMap } from "./types";

const DEFAULT_MAX_ENTRIES = 50;

interface CacheEntry {
  blame: FileBlameMap;
  /** Insertion timestamp (ms since epoch) — reserved for future TTL use. */
  insertedAt: number;
}

export class BlameCache {
  /** Ordered map preserves insertion order; we evict the front (oldest). */
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /** Build the cache key. */
  private key(filePath: string, gitHead: string): string {
    return `${filePath}::${gitHead}`;
  }

  /** Retrieve a cached blame map, or undefined on cache miss. */
  get(filePath: string, gitHead: string): FileBlameMap | undefined {
    const k = this.key(filePath, gitHead);
    const entry = this.store.get(k);
    if (!entry) {
      return undefined;
    }
    // Refresh insertion order (LRU touch)
    this.store.delete(k);
    this.store.set(k, entry);
    return entry.blame;
  }

  /** Store blame data for a file at a given HEAD. */
  set(filePath: string, gitHead: string, blame: FileBlameMap): void {
    const k = this.key(filePath, gitHead);
    // Remove first to reset insertion order
    this.store.delete(k);
    this.store.set(k, { blame, insertedAt: Date.now() });
    this.evictIfNeeded();
  }

  /** Invalidate all cache entries for a given file path (across all HEADs). */
  invalidateFile(filePath: string): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(`${filePath}::`)) {
        this.store.delete(k);
      }
    }
  }

  /** Invalidate all entries for a given repo root (e.g. on HEAD change). */
  invalidateRepo(repoRoot: string): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(repoRoot)) {
        this.store.delete(k);
      }
    }
  }

  /** Remove all cached entries. */
  clear(): void {
    this.store.clear();
  }

  /** Evict the oldest entry when over capacity. */
  private evictIfNeeded(): void {
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }
  }
}

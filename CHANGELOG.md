# Changelog

All notable changes to CursorBlame will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] — 2026-03-07

### Added

- **Loading placeholder** — on the first cursor move to a line in a cold-cache file, a subtle `loading…` annotation appears immediately instead of a blank gap, giving instant visual feedback while `git blame` runs in the background
- **Multi-cursor / multi-selection handling** — when the cursor spans more than one distinct line (e.g. `Alt+Click` multi-cursor), blame annotations are suppressed and the status bar shows `$(git-commit) Multiple selections` instead of showing potentially misleading blame for only the primary cursor
- **Configurable snooze duration** (`cursorblame.snoozeDurationMinutes`) — the Snooze command duration is now configurable (1–480 minutes, default `30`). The status bar label and info message reflect the actual duration
- **Real end-to-end integration tests** — the integration test suite now opens `package.json` in a real extension host, triggers the blame pipeline, and asserts that the returned `BlameInfo` contains a valid SHA, non-empty author, and positive `authorTime`. Also tests `getBlameForLine` for out-of-range lines

### Improved

- `hasMultipleDistinctLines` helper extracted to `decorationHelpers.ts` with a structural type, making it independently unit-testable (7 new unit tests)
- `LOADING_BLAME_INFO` sentinel shape verified by 6 dedicated unit tests

---

## [1.1.0] — 2026-03-07

### Added

- **Flicker-free line transitions** — when moving between lines in a file whose blame is already cached, the new annotation is rendered immediately (no blank gap). The async debounce path still fires afterwards to refresh remote info and the full commit body
- **Snooze command** (`CursorBlame: Snooze Annotations (30 min)`, `Alt+Shift+Z`) — temporarily hides all annotations and the status bar item for 30 minutes; press the same keybinding again to cancel early. Status bar shows a `$(bell-slash) CursorBlame snoozed` indicator while active
- **Gutter recent-only filter** (`cursorblame.gutterRecentDays`) — when `gutterMode` is enabled, set this to a number of days (e.g. `30`) to show gutter annotations only for lines changed within that window. Default `0` = annotate all lines as before
- **Hotspot toggle** (`cursorblame.hotspotEnabled`) — disable the Explorer fire-badge hotspot decorations independently from the rest of the extension. Toggling it off immediately clears any existing badges

### Fixed

- Timeline sidebar panel is now auto-populated from the active file's blame data on extension startup, so it is no longer empty until the first cursor movement

---

## [1.0.0] — 2026-03-07

### Changed

- Version bumped to 1.0.0 — all planned roadmap features are complete and the extension has been verified working in Cursor and VS Code
- CI security grep now correctly excludes comment lines, preventing false positives from explanatory doc-strings

### Fixed

- Security grep in `ci.yml` would match the literal pattern in source comments; grep now filters out `//` and `*` comment lines before failing

---

## [0.2.0] — 2026-03-06

### Added

- **Status bar item** — current line's blame (author + short SHA) shown in the left status bar; click to open commit on remote
- **Always-on mode** (`cursorblame.mode: "always"`) — annotation stays visible while typing on the same line; only refreshes when the cursor moves to a different line. Set to `"hover"` for the original clear-on-any-selection-change behaviour
- **Copy SHA command** (`CursorBlame: Copy Commit SHA`, `Alt+Shift+C`) — copies the full 40-char SHA to the clipboard
- **Merge-commit skip** (`cursorblame.followMerges`) — passes `--first-parent` to `git blame` so merge commits are attributed to the merge author rather than the original commit author
- **Cache pre-warming** — blame is computed in the background when a file is opened, so the first annotation appears with no perceptible delay
- **Windows path normalisation** — file paths with backslashes are converted to forward slashes before being passed to git, fixing blame on Windows
- **Age-based opacity** (`cursorblame.ageFadeMaxDays`) — older commits are rendered at lower opacity; fully fresh commits are fully opaque
- **Full-file gutter mode** (`cursorblame.gutterMode`) — shows compact initials + short SHA on every line simultaneously
- **Per-author colour coding** (`cursorblame.authorColors`) — each author gets a stable, hash-derived colour
- **Full commit body on hover** — the hover tooltip now includes the full multi-paragraph commit message when it differs from the one-line summary
- **Open associated PR/MR** (`CursorBlame: Open Pull Request / Merge Request`) — queries the GitHub / GitLab API to find and open the pull request that introduced the commit
- **Secure token storage** (`CursorBlame: Set GitHub Token`) — GitHub PAT stored in VSCode's encrypted `SecretStorage`, never in settings
- **Jump to next / prev line from same commit** (`Alt+]` / `Alt+[`)
- **Inline diff peek** (`CursorBlame: Peek Diff for Current Commit`) — delegates to the built-in Git extension's diff view
- **File authorship stats** (`CursorBlame: Show File Authorship Stats`) — opens a side panel with a per-author breakdown of line ownership
- **Hotspot detection** — files with ≥ 3 commits in the last 90 days get a 🔥 badge in the Explorer
- **Rename follow** — blame correctly tracks files that were renamed in git history
- **Monorepo support** — git root is resolved by walking up from the file path, so nested repos inside a workspace are handled correctly
- **Ignored authors** (`cursorblame.ignoredAuthors`) — hide annotations from bots or specific authors
- **File Timeline view** — sidebar panel listing the unique commits that touched the current file, sorted by recency
- **Workspace Blame Dashboard** — sidebar panel showing recently-changed files grouped by repository
- **Public extension API** — `getBlameForLine(uri, line)` exposed so other extensions can consume blame data
- **Test infrastructure** — 136 unit tests with 80 % line/function coverage gate; integration test scaffold

### Fixed

- Activity-bar sidebar icon now uses a proper SVG file path instead of a ThemeIcon shorthand (fixes views registration in Cursor)

### Changed

- `cursorblame.mode` defaults to `"always"` — annotations no longer flicker when typing on a blamed line

---

## [0.1.0] — 2026-03-05

### Added

- Inline git blame annotation on the active cursor line using VSCode's `after` decoration API (non-selectable, non-editable overlay)
- Hover tooltip on the annotation with full commit details and a clickable link to open the commit on the remote
- Keyboard shortcut `Alt+Shift+O` to open the current line's commit on the remote
- `CursorBlame: Toggle Inline Blame` command to enable/disable without opening Settings
- Remote provider auto-detection for GitHub, GitLab, Bitbucket, and Azure DevOps; SSH and git-protocol URLs normalised to HTTPS automatically
- Per-file LRU blame cache (max 50 entries) keyed by file path + HEAD SHA; invalidated on file save and `.git/HEAD` changes
- Configurable annotation format template with tokens: `{author}`, `{timeAgo}`, `{date}`, `{summary}`, `{sha}`, `{shortSha}`
- Settings: `enabled`, `format`, `maxSummaryLength`, `foregroundColor`, `debounceMs`, `ignoreWhitespace`
- Workspace trust support — disabled automatically in untrusted workspaces
- Compatible with VSCode ≥ 1.75.0 and Cursor

[1.2.0]: https://github.com/hernanc/cursorblame/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/hernanc/cursorblame/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/hernanc/cursorblame/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/hernanc/cursorblame/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hernanc/cursorblame/releases/tag/v0.1.0

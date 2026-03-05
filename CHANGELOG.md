# Changelog

All notable changes to CursorBlame will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/hernanc/cursorblame/releases/tag/v0.1.0

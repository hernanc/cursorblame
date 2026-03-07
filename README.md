# CursorBlame

[![Latest Release](https://img.shields.io/github/v/release/hernanc/cursorblame?label=download&color=blue)](https://github.com/hernanc/cursorblame/releases/latest)
[![CI](https://github.com/hernanc/cursorblame/actions/workflows/ci.yml/badge.svg)](https://github.com/hernanc/cursorblame/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> Inline git blame — exactly when you need it, invisible when you don't.

CursorBlame shows commit authorship directly in the editor as you move through your code. No permanent noise, no cluttered gutter — the annotation appears on the current line in subtle italic grey and disappears the moment you move away.

---

## Features

### Core
- **Inline annotation on the active line** — author, relative time, and commit summary appended after your code, on a separate rendering layer (non-selectable, non-editable)
- **Hover tooltip with commit details** — hover the annotation to see the full commit message body, author, date, and a direct link to the commit on your remote
- **Click-to-remote** — `Alt+Shift+O` opens the current line's commit on GitHub, GitLab, Bitbucket, or Azure DevOps
- **Copy SHA** — `Alt+Shift+C` copies the commit hash to the clipboard
- **Flicker-free transitions** — when blame is cached, the new annotation renders instantly as you move between lines with no blank gap

### Modes & Display
- **Always-on or hover mode** — `cursorblame.mode` controls whether annotations are permanently visible or appear only on explicit hover
- **Gutter mode** — annotate every line in the file with a compact `AB  abc1234f` label in the gutter, like a permanent blame view; optionally limited to recently-changed lines
- **Age-based opacity** — older commits fade out proportionally so recent changes pop visually
- **Per-author color coding** — each author gets a stable colour derived from their email address
- **Annotation theme presets** — choose from built-in themes (`default`, `minimal`, `verbose`, `compact`) or write your own format string

### Navigation
- **Jump to next/previous change** — `Alt+]` / `Alt+[` moves the cursor to the next or previous line with a different commit
- **Peek inline diff** — see what a commit changed without leaving the file
- **PR/MR link in tooltip** — when a GitHub or GitLab token is configured, the tooltip includes a link to the associated pull/merge request

### Sidebar
- **File Timeline view** — a sidebar tree showing every commit that touched the active file, auto-populated on activation
- **Workspace Blame Dashboard** — top-level view listing all files in the workspace ranked by commit churn

### Other
- **File authorship stats** — `CursorBlame: Show File Stats` summarises who owns what percentage of the file
- **Hotspot badges** — files with high commit churn get a 🔥 badge in the Explorer (independently toggleable)
- **Snooze** — `Alt+Shift+Z` hides annotations for 30 minutes; press again to cancel early
- **Ignored authors** — filter out bot commits by author name or email substring
- **Smart LRU cache** — blame data is cached per file per HEAD SHA; invalidates automatically on save, branch switch, or new commit
- **Works offline** — zero network requests (except optional PR lookup); everything runs against your local git
- **Compatible with VS Code and Cursor**

---

## How It Looks

The annotation appears at the end of the line where your cursor sits:

```
const triggerRect = useRect(triggerRef, isVisible);     Sam Horton, 3 months ago • fix: do not blindly...
```

Hover the annotation to see the full commit details and a link to open it on your remote.

---

## Requirements

- Git must be installed and available on your `PATH`
- The file must be tracked by a git repository

---

## Installation

CursorBlame is distributed as a `.vsix` file via GitHub Releases — no Marketplace account required.

### Step 1 — Download

Go to the [Releases page](https://github.com/hernanc/cursorblame/releases/latest) and download the `.vsix` file from the latest release (e.g. `cursorblame-1.2.0.vsix`).

### Step 2 — Install

**Option A — Command line (recommended)**

```bash
# VS Code
code --install-extension cursorblame-1.2.0.vsix

# Cursor
cursor --install-extension cursorblame-1.2.0.vsix
```

**Option B — GUI**

1. Open the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Click the `⋯` menu at the top right of the panel
3. Select **Install from VSIX…**
4. Pick the downloaded file

### Step 3 — Reload

Reload the window when prompted (`Ctrl+Shift+P` → **Developer: Reload Window**). The extension activates automatically from then on.

---

## Commands

| Command | Keybinding | Description |
|---|---|---|
| `CursorBlame: Open Commit on Remote` | `Alt+Shift+O` | Opens the current line's commit in your browser |
| `CursorBlame: Copy SHA` | `Alt+Shift+C` | Copies the commit hash to the clipboard |
| `CursorBlame: Toggle Inline Blame` | — | Enable / disable annotations without opening Settings |
| `CursorBlame: Toggle Gutter Mode` | — | Show/hide the full-file gutter annotation view |
| `CursorBlame: Toggle Author Colors` | — | Enable / disable per-author colour coding |
| `CursorBlame: Jump to Next Change` | `Alt+]` | Move cursor to the next line with a different commit |
| `CursorBlame: Jump to Previous Change` | `Alt+[` | Move cursor to the previous line with a different commit |
| `CursorBlame: Peek Inline Diff` | — | Show the diff introduced by the current line's commit |
| `CursorBlame: Show File Stats` | — | Open a summary of file authorship percentages |
| `CursorBlame: Show Timeline` | — | Focus the File Timeline sidebar view |
| `CursorBlame: Show Workspace Dashboard` | — | Focus the Workspace Blame Dashboard view |
| `CursorBlame: Snooze Annotations (30 min)` | `Alt+Shift+Z` | Hide annotations for 30 minutes; press again to cancel |

---

## Configuration

All settings live under the `cursorblame` namespace and can be changed in `settings.json` or via the Settings UI.

### Core

| Setting | Default | Description |
|---|---|---|
| `cursorblame.enabled` | `true` | Enable or disable inline blame annotations globally |
| `cursorblame.mode` | `"always"` | `"always"` keeps the annotation visible while you type on the same line; `"hover"` shows it only on demand |
| `cursorblame.format` | `"{author}, {timeAgo} • {summary}"` | Annotation format string — see [Format Tokens](#format-tokens) below |
| `cursorblame.themePreset` | `""` | Apply a built-in theme preset (`default`, `minimal`, `verbose`, `compact`). Overrides `cursorblame.format` when set |
| `cursorblame.maxSummaryLength` | `60` | Maximum characters of commit summary shown in the annotation |
| `cursorblame.foregroundColor` | `""` | Annotation colour — any CSS colour (e.g. `#888888`), a `theme:<id>` reference, or empty for the theme-aware default |
| `cursorblame.debounceMs` | `150` | Delay in milliseconds before blame is shown after the cursor stops moving |
| `cursorblame.ignoreWhitespace` | `false` | Pass `-w` to `git blame` to ignore whitespace-only changes |
| `cursorblame.followMerges` | `false` | Pass `--first-parent` to `git blame` to follow only the main branch history through merges |

### Gutter Mode

| Setting | Default | Description |
|---|---|---|
| `cursorblame.gutterMode` | `false` | Show a compact blame label (`AB  abc1234f`) for every line in the file, not just the active line |
| `cursorblame.gutterRecentDays` | `0` | When `gutterMode` is enabled, only annotate lines changed within this many days. `0` = annotate all lines |

### Author Colours & Age

| Setting | Default | Description |
|---|---|---|
| `cursorblame.authorColors` | `false` | Give each author a stable colour derived from their email address |
| `cursorblame.ageFadeMaxDays` | `365` | Commits older than this many days are shown at minimum opacity; newer commits fade from full opacity proportionally |

### Filtering

| Setting | Default | Description |
|---|---|---|
| `cursorblame.ignoredAuthors` | `[]` | List of author names or email substrings to skip entirely (e.g. `["ci-bot@", "dependabot"]`) |

### Hotspots

| Setting | Default | Description |
|---|---|---|
| `cursorblame.hotspotEnabled` | `true` | Show 🔥 fire-badge decorations in the Explorer for files with high commit churn. Disable to remove badges without affecting other features |

### Snooze

| Setting | Default | Description |
|---|---|---|
| `cursorblame.snoozeDurationMinutes` | `30` | How long (in minutes) the Snooze command (`Alt+Shift+Z`) hides annotations. Range: 1–480 |

### Token Authentication (for PR/MR links)

| Setting | Default | Description |
|---|---|---|
| `cursorblame.githubToken` | `""` | Personal access token for the GitHub API (used to look up associated pull requests in the hover tooltip) |
| `cursorblame.gitlabToken` | `""` | Personal access token for the GitLab API (used to look up associated merge requests) |

Tokens are stored in VS Code's `SecretStorage` — they are never logged, transmitted, or stored in plain text.

---

## Format Tokens

The `cursorblame.format` string (and custom theme presets) support these tokens:

| Token | Example output |
|---|---|
| `{author}` | `Sam Horton` |
| `{timeAgo}` | `3 months ago` |
| `{date}` | `Dec 5, 2025` |
| `{summary}` | `fix: do not blindly…` |
| `{sha}` | `a1b2c3d4e5f6…` (full 40-char SHA) |
| `{shortSha}` | `a1b2c3d4` |

**Built-in theme presets:**

| Preset | Format |
|---|---|
| `default` | `{author}, {timeAgo} • {summary}` |
| `minimal` | `{shortSha} {timeAgo}` |
| `verbose` | `{author} <{sha}> {date} — {summary}` |
| `compact` | `{author} · {summary}` |

**Examples:**

```json
// Show only author and date
"cursorblame.format": "{author} · {date}"

// Short SHA first, then summary
"cursorblame.format": "[{shortSha}] {author}: {summary}"

// Use a preset instead of a custom format
"cursorblame.themePreset": "minimal"
```

---

## Supported Remote Providers

The click-to-remote and PR-lookup features support:

- **GitHub** — `github.com`
- **GitLab** — `gitlab.com` and self-hosted `gitlab.*` instances
- **Bitbucket** — `bitbucket.org`
- **Azure DevOps** — `dev.azure.com` and `*.visualstudio.com`
- **Other hosts** — falls back to `{remote}/commit/{sha}`

Both HTTPS and SSH remote URLs are normalised automatically.

---

## Security

- All git commands use `child_process.execFile()` with an explicit argument array — never shell string interpolation — preventing command injection through file paths or branch names
- `--` always separates git options from file paths (prevents path-as-option injection)
- Commit SHAs are validated with `/^[0-9a-f]{40}$/` before being embedded in any URL
- Only `https://` URLs are ever opened; `http://`, `file://`, `javascript:`, and all other schemes are rejected
- API tokens are stored in VS Code's `SecretStorage` (the OS keychain), never in `settings.json`
- The extension is automatically disabled in [untrusted workspaces](https://code.visualstudio.com/docs/editor/workspace-trust)
- Zero telemetry; no data leaves your machine except optional GitHub/GitLab API calls for PR lookups

---

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/hernanc/cursorblame).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

### Quick start

```bash
git clone https://github.com/hernanc/cursorblame.git
cd cursorblame
npm install

# Type-check
npm run typecheck

# Run unit tests
npm test

# Development build (with source maps)
npm run build

# Watch mode
npm run watch
```

Press **F5** in VS Code/Cursor to launch an Extension Development Host with the extension loaded.

### Building a local `.vsix`

```bash
npm run package
# → cursorblame-<version>.vsix
```

Install it with `code --install-extension cursorblame-*.vsix` or via the GUI as described above.

### Project structure

```
src/
  extension.ts          Entry point — activation, event wiring, commands, workspace trust
  gitBlame.ts           git blame execution (execFile) and --line-porcelain parser
  blameCache.ts         Per-file LRU cache, invalidated on save / HEAD change
  decoration.ts         TextEditorDecorationType management (inline and gutter overlays)
  decorationHelpers.ts  Pure helper functions (time formatting, colour, opacity, filters)
  remoteUrl.ts          Remote provider detection and commit URL construction
  prLookup.ts           GitHub / GitLab PR/MR lookup via API
  fileStats.ts          Per-file authorship statistics
  hotspot.ts            FileDecorationProvider for Explorer hotspot badges
  views/
    timeline.ts         File Timeline sidebar tree view
    dashboard.ts        Workspace Blame Dashboard sidebar tree view
  types.ts              Shared TypeScript interfaces
```

---

## License

[MIT](LICENSE) © HernanC

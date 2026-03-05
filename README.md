# CursorBlame

> Inline git blame — exactly when you need it, invisible when you don't.

CursorBlame shows commit authorship directly in the editor as you move through your code. No permanent noise, no cluttered gutter — the annotation appears on the current line in subtle italic grey and disappears the moment you move away.

---

## Features

- **Inline annotation on the active line** — shows author, relative time, and commit summary appended after the code, on a separate rendering layer (non-selectable, non-editable)
- **Hover tooltip with clickable commit link** — hover over the annotation to reveal a tooltip with a direct link to the commit on your remote (GitHub, GitLab, Bitbucket, Azure DevOps)
- **Keyboard shortcut** — press `Alt+Shift+O` to open the current line's commit on the remote without touching the mouse
- **Smart caching** — blame data is cached per file per HEAD SHA; cache invalidates automatically on save, branch switch, or new commit
- **Works offline** — zero network requests; everything runs against your local git
- **Compatible with VSCode and Cursor**

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

### From the Marketplace

Search for **CursorBlame** in the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`).

### From a `.vsix` file

```bash
# VSCode
code --install-extension cursorblame-0.1.0.vsix

# Cursor
cursor --install-extension cursorblame-0.1.0.vsix
```

---

## Configuration

All settings are under the `cursorblame` namespace and can be changed in your `settings.json` or via the Settings UI.

| Setting | Default | Description |
|---|---|---|
| `cursorblame.enabled` | `true` | Enable or disable inline blame annotations |
| `cursorblame.format` | `"{author}, {timeAgo} • {summary}"` | Annotation format template |
| `cursorblame.maxSummaryLength` | `60` | Maximum characters of commit summary shown |
| `cursorblame.foregroundColor` | `""` | Annotation color — any CSS value (e.g. `#888888`), `theme:<id>`, or empty for a theme-aware default |
| `cursorblame.debounceMs` | `150` | Delay (ms) before blame is shown after cursor stops |
| `cursorblame.ignoreWhitespace` | `false` | Ignore whitespace-only changes (`git blame -w`) |

### Format Tokens

The `cursorblame.format` string supports these tokens:

| Token | Example output |
|---|---|
| `{author}` | `Sam Horton` |
| `{timeAgo}` | `3 months ago` |
| `{date}` | `Dec 5, 2025` |
| `{summary}` | `fix: do not blindly…` |
| `{sha}` | `a1b2c3d4e5f6…` (full SHA) |
| `{shortSha}` | `a1b2c3d4` |

**Example — show only author and date:**
```json
"cursorblame.format": "{author} · {date}"
```

**Example — show short SHA first:**
```json
"cursorblame.format": "[{shortSha}] {author}: {summary}"
```

---

## Commands

| Command | Keybinding | Description |
|---|---|---|
| `CursorBlame: Open Commit on Remote` | `Alt+Shift+O` | Opens the current line's commit on the remote in your browser |
| `CursorBlame: Toggle Inline Blame` | — | Enable / disable annotations without opening Settings |

---

## Supported Remote Providers

The click-to-remote feature supports:

- **GitHub** — `github.com`
- **GitLab** — `gitlab.com` and self-hosted `gitlab.*`
- **Bitbucket** — `bitbucket.org`
- **Azure DevOps** — `dev.azure.com` and `visualstudio.com`
- **Other hosts** — falls back to `{remote}/commit/{sha}`

Both HTTPS and SSH remote URLs are normalised automatically.

---

## Security

- All git commands use `child_process.execFile()` with an explicit argument array — never shell string interpolation — preventing command injection
- Commit SHAs are validated with `/^[0-9a-f]{40}$/` before being embedded in any URL
- Only `https://` URLs are ever opened; all other protocols are rejected
- The extension is automatically disabled in [untrusted workspaces](https://code.visualstudio.com/docs/editor/workspace-trust)
- Zero telemetry, zero external network requests

---

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/hernanc/cursorblame).

### Development setup

```bash
git clone https://github.com/hernanc/cursorblame.git
cd cursorblame
npm install

# Type-check
npx tsc --noEmit

# Development build (with source maps)
npm run build

# Watch mode
npm run watch
```

Then press **F5** in VSCode/Cursor to launch an Extension Development Host with the extension loaded.

### Project structure

```
src/
  extension.ts    Entry point — activation, event wiring, commands
  gitBlame.ts     git blame execution and line-porcelain parsing
  blameCache.ts   Per-file LRU cache, invalidated on save / HEAD change
  decoration.ts   TextEditorDecorationType management (after-text overlay)
  remoteUrl.ts    Remote provider detection and commit URL construction
  types.ts        Shared TypeScript interfaces
```

---

## License

[MIT](LICENSE) © HernanC

# Contributing to CursorBlame

Thank you for taking the time to contribute! This document covers everything you need to get from zero to a working pull request.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Commit Message Convention](#commit-message-convention)
- [Opening a Pull Request](#opening-a-pull-request)
- [Release Process](#release-process)

---

## Code of Conduct

Be respectful, constructive, and welcoming. Harassment or exclusionary behaviour of any kind will not be tolerated.

---

## Reporting Bugs

Before filing a new issue, please [search existing issues](https://github.com/hernanc/cursorblame/issues) to avoid duplicates.

When reporting a bug, include:

- VSCode / Cursor version (`Help → About`)
- Extension version
- OS and shell
- Git version (`git --version`)
- Steps to reproduce
- Expected vs. actual behaviour
- Any relevant output from the **Developer Tools console** (`Help → Toggle Developer Tools`)

---

## Suggesting Features

Open a [GitHub Discussion](https://github.com/hernanc/cursorblame/discussions) or issue with the `enhancement` label. Describe the problem you're trying to solve, not just the solution — that helps evaluate fit and alternatives.

---

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [Git](https://git-scm.com) ≥ 2.x on your `PATH`
- VSCode or [Cursor](https://cursor.sh)

### Steps

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/cursorblame.git
cd cursorblame

# 2. Install dependencies
npm install

# 3. Start the TypeScript watcher
npm run watch
```

Then press **F5** in VSCode/Cursor to launch the **Extension Development Host** — a sandboxed editor with the extension loaded live. Any change you save is picked up immediately by the watcher; reload the host window (`Ctrl+R` / `Cmd+R`) to apply it.

### Useful commands

| Command | Description |
|---|---|
| `npm run watch` | Incremental dev build, rebuilds on save |
| `npm run build` | One-shot dev build (with source maps) |
| `npm run typecheck` | Strict TypeScript check (no emit) |
| `npm run vscode:prepublish` | Production build (minified, no source maps) |
| `npm run package` | Create a `.vsix` for local testing |

---

## Project Structure

```
src/
  extension.ts    Entry point — activation, event wiring, commands
  gitBlame.ts     git blame execution (execFile) and porcelain parser
  blameCache.ts   Per-file LRU cache, invalidated on save / HEAD change
  decoration.ts   TextEditorDecorationType after-text overlay management
  remoteUrl.ts    Remote provider detection and commit URL construction
  types.ts        Shared TypeScript interfaces
images/
  icon.png        Extension icon (128×128 PNG)
.github/
  workflows/
    ci.yml        CI — type-check + build on every push/PR
    release.yml   CD — publish to Marketplace on version tag push
```

---

## Making Changes

1. **Create a branch** off `main`:
   ```bash
   git checkout -b fix/my-bug-fix
   # or
   git checkout -b feat/my-new-feature
   ```

2. **Make your changes** in `src/`.

3. **Type-check** before committing — CI will catch this anyway, but it's faster locally:
   ```bash
   npm run typecheck
   ```

4. **Test manually** in the Extension Development Host (F5).

### Security-sensitive areas

- `gitBlame.ts` — all git commands must use `execFile()` with an explicit argument array, never template strings passed to `exec()`
- `remoteUrl.ts` — commit SHAs must be validated with `/^[0-9a-f]{40}$/` before being embedded in any URL; only `https://` URLs may be returned
- `extension.ts` — URLs received via command arguments must pass the `isSafeUrl()` guard before being passed to `openExternal()`

Please do not weaken any of these constraints.

---

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short summary>
```

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `perf` | A performance improvement |
| `refactor` | Code change that isn't a feature or fix |
| `docs` | Documentation only |
| `chore` | Build, tooling, or dependency updates |
| `ci` | CI/CD changes |

Examples:
```
feat(remoteUrl): add Gitea provider support
fix(blameCache): invalidate on submodule HEAD change
docs: expand contributing guide
```

---

## Opening a Pull Request

1. Push your branch and open a PR against `main`.
2. Fill in the PR template — describe **what** changed and **why**.
3. Ensure CI is green (type-check + build).
4. A maintainer will review and merge, or leave feedback.

PRs that introduce new settings must also update the `README.md` configuration table.

---

## Release Process

Releases are made by a maintainer. If you believe a fix or feature warrants a release, say so in your PR.

When a maintainer is ready to release:

1. Bump `"version"` in `package.json` (semver)
2. Add a section to `CHANGELOG.md`
3. Commit and tag:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: release v0.2.0"
   git tag -a v0.2.0 -m "Release v0.2.0"
   git push origin main --tags
   ```
4. The **Release** GitHub Actions workflow triggers automatically on the tag push, builds the `.vsix`, and attaches it to a new GitHub Release — no manual packaging or uploading needed.

Users install the extension by downloading the `.vsix` from the [Releases page](https://github.com/hernanc/cursorblame/releases) and following the instructions in the README.

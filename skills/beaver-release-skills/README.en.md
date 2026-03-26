# Beaver Release Skills

English | [简体中文](README.md)

## Description

`beaver-release-skills` is a universal dual-release workflow skill powered by [Changesets](https://github.com/changesets/changesets). It is designed to cleanly manage the release lifecycle for modern monorepos by explicitly supporting two distinct release targets:

1. **Unified Skills Library (`skills/`)**: A single, shared version for all text-heavy AI agent skills.
2. **Independent Packages (`packages/`)**: Individual versions for multi-language packages (NPM, Go, Python, Rust, etc.).

## Benefits

- **Dual-Architecture Support**: Gracefully handles the complexity of syncing unified library versions alongside independent tool packages.
- **AI-Assisted Changesets**: Automatically analyzes Git history to generate precise semantic version bumps (Major/Minor/Patch) and drafts release notes.
- **Cross-Language Sync**: Detects independent packages written in Rust, Python, or Go, and synchronizes their native version files (`Cargo.toml`, `pyproject.toml`) with the central Changeset configuration.
- **Multi-language Changelogs**: Automatically translates and merges `CHANGELOG.md` updates into localized files (e.g., `CHANGELOG.zh.md`).
- **Interactive & Safe**: Strictly requires user confirmation before generating changesets, committing bumps, or pushing to remote repositories.

## Workflow

### 1. Create Changeset (AI-Assisted)

- Analyzes `git diff`/`log` for unreleased changes.
- Identifies if the changes belong to `skills/` (unified) or `packages/` (independent).
- Recommends a version bump based on Conventional Commits.
- Prompts for confirmation before generating `.changeset/*.md`.

### 2. Version Bump & Sync

- Executes `npx changeset version` to consume the generated changesets.
- Syncs the updated `package.json` version into multi-language manifest files (e.g., `Cargo.toml`).
- Updates all localized `CHANGELOG.*.md` files.
- Commits the release.

### 3. Push & Publish

- Prompts for confirmation to push tags and commits to the remote repository.
- Supports publishing logic for multi-language artifacts (`npm publish`, `cargo publish`, `twine upload`).

## How to Use

### Triggers

Activate the skill by typing phrases like:

- `release`
- `new version`
- `bump version`
- `changeset`
- `prepare release`

## Dependencies

| Dependency | Type     | Required | Description                                      |
| ---------- | -------- | -------- | ------------------------------------------------ |
| Changesets | CLI Tool | Yes      | Core versioning engine (`@changesets/cli`).      |
| Git        | CLI Tool | Yes      | Used for history analysis, commits, and tagging. |

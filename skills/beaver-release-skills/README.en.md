# Beaver Release Skills

English | [简体中文](README.md)

## Description

`beaver-release-skills` is a universal automated release workflow skill. It automatically detects project types (Node.js, Python, Rust, Claude Plugin, etc.), analyzes changes based on Conventional Commits, suggests semantic versions, generates multi-language changelogs, and handles version updates, commits, tagging, and pushing. It aims to eliminate repetitive tasks and human errors in the release process.

## Benefits

- **Zero-Config Start**: Auto-detects `package.json`, `pyproject.toml`, `Cargo.toml`, and other common version files.
- **Multi-language Support**: Native support for generating synchronized changelogs in `zh`, `en`, `ja`, and more.
- **Intelligent Analysis**: Automatically categorizes features, fixes, and breaking changes from git history to suggest SemVer updates.
- **Module-Aware**: Supports grouping changes by module/skill, ideal for monorepos or multi-plugin projects.
- **Safe & Reliable**: Provides a `--dry-run` mode to preview changes before execution and requires confirmation for versioning and pushing.

🛠️ Version Note: This project is a fork of [baoyu-release-skills](https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-release-skills).

**Key Changes**:

- **Examples & Default Language**: All skill name references changed from `baoyu-*` to `beaver-*` (e.g. `beaver-image-gen`, `beaver-xhs-images`); the unsuffixed `CHANGELOG.md` now defaults to Chinese (zh).
- **Push & Branch Safety**: Push command changed from `git push origin main` to `git push origin HEAD` to prevent accidental pushes on non-main branches.
- **No-Tag Scenario**: Step 2 adds a fallback when no git tags exist (`if [ -z "$LAST_TAG" ]`), treating all commits as unreleased instead of failing.
- **Step Responsibilities**: Step 4 defines changelog format and i18n rules; Step 7 is clarified as the "write files & update version" step, eliminating semantic overlap.
- **Project Type Detection**: Step 5 now checks for a `skills/` directory before grouping changes by skill/module. Standard single-package projects (Python, Rust, etc.) skip Steps 5–6 and go directly to Step 7 with a single release commit.
- **gh CLI Fallback**: Third-party contributor detection requires `gh`; if unavailable or unauthenticated, contributor attribution is skipped without blocking the release.
- **CI Status Check**: After Step 9, if pushed and `gh` is available, prompts `gh run list --limit 1` to check tag-triggered CI status (e.g. npm publish); otherwise reminds the user to check the Actions tab manually.
- **Documentation Split**: Changelog section title translations and multi-language examples moved to `references/changelog-i18n.md`, keeping the main SKILL.md concise via reference links.

## Use Cases

### Recommended

- **Multi-language Open Source Projects**: Projects that need to maintain synchronized changelogs in multiple languages.
- **Standardized Release Pipelines**: Teams looking to unify release patterns (tagging, versioning, changelog formats).
- **Fast-Iterating Plugins/Tools**: Such as Claude plugins or CLI tools that require frequent, high-quality releases.

### Not Recommended

- **Non-Git Projects**: This skill heavily relies on git history for change analysis.
- **Highly Custom Release Logic**: Projects with complex, non-standard release pipelines that cannot be configured via `.releaserc.yml`.

## How to Use

### Triggers

Activate the skill by typing phrases like:
- `release`
- `new version`
- `bump version`
- `prepare release`

### Basic Workflow

1. **Auto-Detection**: Identifies version files, existing multi-language changelogs, and project structure.
2. **Change Analysis**: Compares commits since the last tag to identify features, fixes, and breaking changes.
3. **Changelog Generation**: Writes changelog entries for each language (with automatic contributor attribution).
4. **User Confirmation**: Displays the recommended version (e.g., `1.2.3 → 1.3.0`) and push options.
5. **Execution**: Updates files, creates the release commit, tags the version, and pushes to remote if confirmed.

### Example Interaction

> **User**: Help me release a new version with all current fixes.
>
> **Skill**: Detected Node.js project (v1.0.1) with 3 fix commits. Recommending v1.0.2. Generating Chinese and English changelogs... Ready to release. Confirm version bump and push?

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--dry-run` | No | - | Preview mode. Shows what would happen without modifying any files. |
| `--major` | No | - | Forces a major version bump. |
| `--minor` | No | - | Forces a minor version bump. |
| `--patch` | No | - | Forces a patch version bump. |

## Dependencies

| Dependency | Type | Required | Description |
|---|---|---|---|
| Git | CLI Tool | Yes | Used for history analysis, commits, and tagging. |
| GitHub CLI (gh) | CLI Tool | No | Used for identifying contributors and checking CI status. |

## Considerations

- **Commit Conventions**: It is highly recommended to follow Conventional Commits (e.g., `feat: ...`, `fix: ...`) for accurate analysis.
- **Breaking Changes**: Ensure breaking changes are marked with `BREAKING CHANGE` in the commit message to trigger major version warnings.
- **Remote Permissions**: Pushing to a remote repository requires write permissions for the configured remote.

## FAQ

**Q: How does it find my changelog files?**
**A:** It scans the root directory for Markdown files starting with `CHANGELOG` or `HISTORY` and detects the language from the suffix (e.g., `.en.md`).

**Q: Can I customize the changelog categories?**
**A:** Yes, by creating a `.releaserc.yml` in the project root, you can map specific commit types to custom changelog sections.

**Q: Does it work without GitHub CLI?**
**A:** Yes. `gh` is only used for non-critical features like PR author identification; the core release flow remains fully functional.

## Acknowledgements

This project is heavily inspired by and built upon:

- [baoyu-release-skills](https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-release-skills) by [@Jim Liu (宝玉)](https://github.com/JimLiu/)

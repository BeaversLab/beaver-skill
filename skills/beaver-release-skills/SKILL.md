---
name: beaver-release-skills
description: Dual-release workflow for the Beaver Skills library. Use "release skill" to update the unified skills version or "release package <name>" to update independent CLI tools (NPM, Rust, Python, Go). Powered by Changesets.
---

# Release Skills

Universal workflow for releasing the **Beaver Skills Library** and its **Independent Packages**.

## Requirements

- **Changesets**: This skill is **strictly dependent** on [Changesets](https://github.com/changesets/changesets).
- **Pre-flight Check**: Verify `@changesets/cli` is available and `.changeset/config.json` exists before starting.

## Core Mandate

Always distinguish between the two release targets:

1. **Unified Skill Release**: Targets the entire `skills/` library as one version (e.g., `@beaverslab/skills`).
2. **Independent Package Release**: Targets a specific tool in `packages/<name>/` with its own version.

## Phase 1: Create Changeset (Research & Plan)

**Analyze intent and changes to propose a changeset:**

- **Identify Target**:
  - If user says "release skill" -> Proposal for `@beaverslab/skills`.
  - If user says "release package <name>" -> Proposal for `@beaverslab/<name>`.
- **Scan Changes**: Analyze `git diff` and `git log` since the last release tag.
- **Determine Bump**: Propose `patch`, `minor`, or `major` based on [Conventional Commits](https://www.conventionalcommits.org/).
- **Draft Notes**: Summarize key user-facing changes (Features, Fixes, Breaking Changes).
- **Ask User**: Confirm the target, bump type, and notes.
- **Act**: Generate `.changeset/<random-name>.md`.

## Phase 2: Apply Version (Execution)

**Consume changesets and synchronize across languages:**

- **Act**: Run `npx changeset version`.
- **Create Tag**: Manually create a version tag (e.g., `git tag v0.5.0`) matching the root `package.json` version.
- **Sync Non-NPM Files**:
  - If a package is **Rust** (`Cargo.toml`), **Python** (`pyproject.toml`), or **Go** (`VERSION`), read the new version from its `package.json` and sync it to its native manifest.
- **Update Localized Changelogs**:
  - **Scan**: Identify all `CHANGELOG*.md` files in the root directory.
  - **Standard**: Follow categories and date format defined in `references/changelog-i18n.md`.
  - **Categories**: Use mandatory sections: `New Features`, `Improvements & Fixes`, `CI/CD`, `Documentation`, `Breaking Changes`.
  - **Sync**: Simultaneously update ALL identified files with appropriate translations for each version bump.
- **Commit**: Create a release commit (e.g., `chore: release v0.5.0`).

## Phase 3: Publish (Verification)

**Finalize the release and push to remotes:**

- **Ask User**: Confirm the final version bump and whether to push to origin.
- **Act**: Push commit and tags to `origin HEAD`.
- **Publish Artifacts**:
  - Run `npx changeset publish` for NPM.
  - Run `cargo publish` or `twine upload` for other languages if applicable.

## Directives

- **Strict Dependency**: All versioning operations must go through `changeset` CLI commands.
- **Zero Hallucination**: Only propose bumps for packages that actually have changes.
- **User First**: Never write a changeset or commit version bumps without explicit user confirmation.
- **Progressive Disclosure**: For complex changelog translation rules, refer to [references/changelog-i18n.md](references/changelog-i18n.md).

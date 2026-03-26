---
name: beaver-release-skills
description: Dual-release workflow powered by Changesets. Manages unified skills library and independent packages (NPM, Go, Python, Rust). Use when user says "release", "发布", "new version", "changeset", "bump version".
---

# Release Skills

Universal dual-release workflow powered by [Changesets](https://github.com/changesets/changesets).

It explicitly manages two distinct targets:

1. **Skills Library (`skills/`)**: Unified versioning for all AI agent skills.
2. **Packages (`packages/`)**: Independent versioning for isolated tools and CLI utilities (supports NPM, Go, Python, Rust, etc.).

## Workflow Phases

### Phase 1: Create Changeset (AI-Assisted)

When there are unreleased changes or the user requests a changeset:

1. **Analyze Changes**: Check `git diff` and `git log` to identify affected directories.
   - Changes in `skills/*` -> Target the unified skills package (e.g., `@beaverslab/skills`).
   - Changes in `packages/<name>/*` -> Target the specific independent package.
2. **Determine SemVer**: Infer bump type (`major`, `minor`, `patch`) based on semantic commit types (feat, fix, BREAKING CHANGE).
3. **Draft Release Notes**: Synthesize a concise summary of the changes.
4. **User Confirmation**: Present the proposed package targets, bump types, and release notes to the user.
5. **Write File**: Upon approval, generate the `.changeset/<random-name>.md` file.

### Phase 2: Version Bump & Sync

When the user requests to apply versions or finalize the release:

1. **Execute Changesets**: Run `npx changeset version` to consume changesets and bump `package.json` versions.
2. **Sync Multi-Language Projects**:
   - Changesets natively updates `package.json`.
   - If a changed package is Rust, Python, or Go, read the newly bumped version from its `package.json` and sync it to its native version file (`Cargo.toml`, `pyproject.toml`, `VERSION`).
3. **Generate Multi-Language Changelogs**:
   - Extract the new entries from the automatically generated `CHANGELOG.md`.
   - Translate and prepend these entries to any existing localized changelogs (e.g., `CHANGELOG.zh.md`, `CHANGELOG.en.md`).
4. **Commit**: Stage all modified version files, `.changeset` deletions, and changelogs. Create the release commit (e.g., `chore: release packages`).

### Phase 3: Push & Publish

1. **User Confirmation**: Ask the user if they want to push the release commit and tags to the remote repository.
2. **Publish (If Requested)**:
   - NPM: `npx changeset publish`
   - Rust: `cargo publish`
   - Python: `twine upload`

## Key Directives

- **Always ask for confirmation** before writing changesets, committing, or pushing.
- **Respect Boundaries**: Never mix the unified skills version bump with unrelated independent package bumps unless both have changed.
- **Maintain Sync**: Always ensure non-NPM packages have their native version files updated to match the Changeset truth.

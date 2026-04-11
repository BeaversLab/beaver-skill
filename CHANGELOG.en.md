# Changelog

## 0.6.5

### Internal Changes

- **project**: Release `@beaverslab/rss-digest` v0.5.0.
- **beaver-rss-digest**: Add `--stdout` output mode for AI and pipeline consumption.
- **beaver-rss-digest**: Default to standard output when `defaults.outputDir` is not configured.
- **project**: Synchronize `@beaverslab/skills` to v0.6.5.

## 0.6.4

### Internal Changes

- **project**: Release `@beaverslab/rss-digest` v0.4.0.
- **beaver-rss-digest**: Switch to precompiled `dist` publishing for direct `bunx` / `npx` usage.
- **beaver-rss-digest**: Fix RSS / Atom CDATA parsing and mixed-text JSON extraction, and add unit tests.
- **project**: Synchronize `@beaverslab/skills` to v0.6.4.

## 0.6.3

### Internal Changes

- **project**: Release `@beaverslab/rss-digest` v0.3.0.
- **beaver-rss-digest**: Add a standalone CLI entry and bundled default configuration assets.
- **beaver-rss-digest**: Remove the skill-local wrapper layer and standardize package-level CLI usage.
- **project**: Synchronize `@beaverslab/skills` to v0.6.3.

## 0.6.2 - 2026-04-08

### Internal Changes

- **project**: Release `@beaverslab/rss-digest` v0.2.0.
- **project**: Synchronize `@beaverslab/skills` to v0.6.2.

## 0.6.1 - 2026-03-31

### New Features

- **beaver-resource-compilation**: Add `content_hash` field for content deduplication and change detection.

## 0.6.0 - 2026-03-31

### New Features

- **beaver-resource-compilation**: Add new skill for collecting and compiling markdown resources from multiple source directories with auto-generated frontmatter (title, tags, summary, etc.).

### Documentation

- **project**: Update changelog title to Chinese.

## 0.5.2 - 2026-03-26

### Documentation

- **beaver-release-skills**: Establish standardized multi-language changelog workflow and formatting rules.

## 0.5.1 - 2026-03-26

### Improvements & Fixes

- **beaver-release-skills**: Add explicit "Create Tag" step to the release workflow.

## 0.5.0 - 2026-03-26

### New Features

- **beaver-release-skills**: Redesign skill for Changesets dual-release architecture (Unified library & Independent packages).

## 0.4.2 - 2026-03-26

### Improvements & Fixes

- **project**: Implement dual-versioning strategy for skills and packages.
- **project**: Consolidate all skills into the unified `@beaverslab/skills` package.

## 0.4.1 - 2026-03-11

### New Features

- **beaver-markdown-i18n**: Enhance translation scripts with placeholder checks and task metadata management.

### Documentation

- **project**: Update README files and remove redundant lines for better clarity.
- **beaver-release-skills**: Update README documentation.

## 0.4.0 - 2026-03-10

### New Features

- **beaver-markdown-i18n**: Add comprehensive Markdown translation pipeline with AST-level masking and incremental sync.
- **beaver-markdown-i18n**: Add unified CLI tools (translate-cli, quality-cli, plan-cli).
- **beaver-skill**: Add AGENTS.md to define skill structure standards.

### Improvements & Fixes

- **beaver-markdown-i18n**: Consolidate scripts and enhance quality validation process.

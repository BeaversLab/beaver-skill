# @beaverslab/skills

## 0.6.5

### Patch Changes

- Add `--stdout` to `@beaverslab/rss-digest` so the final report can be written directly to standard output for AI and pipeline workflows.

  When `defaults.outputDir` is not configured, the `run` command now defaults to stdout output instead of requiring a file path.

  Add CLI tests for stdout and file output behavior, and update the bundled skill documentation to describe the new output strategy.

- Updated dependencies
  - @beaverslab/rss-digest@0.5.0

## 0.6.4

### Patch Changes

- Updated dependencies
  - @beaverslab/rss-digest@0.4.0

## 0.6.3

### Patch Changes

- Updated dependencies
  - @beaverslab/rss-digest@0.3.0

## 0.6.2

### Patch Changes

- Updated dependencies
  - @beaverslab/rss-digest@0.2.0

## 0.5.2

### Patch Changes

- docs(beaver-release-skills): establish standardized multi-language changelog workflow and formatting rules

## 0.5.1

### Patch Changes

- fix(beaver-release-skills): add explicit "Create Tag" step to the release workflow

## 0.5.0

### Minor Changes

- feat(beaver-release-skills): redesign skill for Changesets dual-release architecture

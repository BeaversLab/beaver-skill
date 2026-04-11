# @beaverslab/rss-digest

## 0.5.0

### Minor Changes

- Add `--stdout` to `@beaverslab/rss-digest` so the final report can be written directly to standard output for AI and pipeline workflows.

  When `defaults.outputDir` is not configured, the `run` command now defaults to stdout output instead of requiring a file path.

  Add CLI tests for stdout and file output behavior, and update the bundled skill documentation to describe the new output strategy.

## 0.4.0

### Minor Changes

- Switch `@beaverslab/rss-digest` to precompiled `dist` publishing for direct `bunx` and `npx` usage.

  Fix RSS and Atom CDATA parsing so feed items are not dropped when fields are wrapped in CDATA.

  Improve JSON extraction from mixed model responses and add unit tests for feed parsing and JSON parsing.

## 0.3.0

### Minor Changes

- Add a standalone `rss-digest` CLI for direct `bunx` or `npx` usage.

  Package default config and i18n assets inside `@beaverslab/rss-digest` so the skill can run without a local wrapper package.

  Remove the skill-local wrapper scripts and document the new invocation flow.

## 0.2.0

### Minor Changes

- Implement RSS digest package with CLI and configuration support. Added CLI commands for initialization, execution, and management of RSS sources. Introduced configuration handling with YAML support, including validation and interactive setup.

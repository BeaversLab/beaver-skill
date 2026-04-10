# @beaverslab/rss-digest

## 0.3.0

### Minor Changes

- Add a standalone `rss-digest` CLI for direct `bunx` or `npx` usage.

  Package default config and i18n assets inside `@beaverslab/rss-digest` so the skill can run without a local wrapper package.

  Remove the skill-local wrapper scripts and document the new invocation flow.

## 0.2.0

### Minor Changes

- Implement RSS digest package with CLI and configuration support. Added CLI commands for initialization, execution, and management of RSS sources. Introduced configuration handling with YAML support, including validation and interactive setup.

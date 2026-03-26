# @beaverslab/claw-backup

## 0.6.0

### Minor Changes

- Add non-interactive mode with --yes and --json flags for AI/CI workflows. Enhance rule resolution logic and command parameters to skip interactive prompts when sufficient arguments are provided.

## 0.4.0

### Major Changes

- **BREAKING CHANGE**: Organize backup archives by rule name.
  - Backup files are now stored in `{backupDir}/{ruleName}/{timestamp}.tar.gz` instead of the root `backupDir`.
  - Removed `archivePrefix` field from rule files as it is no longer used for path generation.
  - Added multi-language documentation support for the CLI tool.

## 0.3.0

### Minor Changes

- Enhanced CLI with custom rule names and flexible path resolution:
  - `init-rule [--name <name>]`: Support custom rule names; auto-generates timestamp-based names if not provided; prevents overwriting existing rules
  - `backup [rule-name-or-path]`: Accepts rule name (looks up in `~/.beaver-skill/beaver-claw-backup/`), relative path, or absolute path
  - `restore [rule-name-or-path]`: Rule-based restore with flexible rule reference
  - `restore <archive.tar.gz> <target-dir>`: Direct extraction mode without requiring a rule file

## 0.2.0

### Minor Changes

- Publish `beaver-claw-backup` as the public npm CLI package `@beaverslab/claw-backup` and add workspace-based Changesets release automation.

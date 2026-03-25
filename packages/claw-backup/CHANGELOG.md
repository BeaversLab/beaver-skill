# @beaverslab/claw-backup

## 0.3.0

### Minor Changes

- Enhanced CLI with custom rule names and flexible path resolution:
  - `init-rule [--name <name>]`: Support custom rule names; auto-generates timestamp-based names if not provided; prevents overwriting existing rules
  - `backup [rule-name-or-path]`: Accepts rule name (looks up in default directory), relative path, or absolute path
  - `restore [rule-name-or-path]`: Rule-based restore with flexible rule reference
  - `restore <archive.tar.gz> <target-dir>`: Direct extraction mode without requiring a rule file

## 0.3.0

### Minor Changes

- Enhanced CLI with custom rule names and flexible path resolution:
  - `init-rule [--name <name>]`: Support custom rule names; auto-generates timestamp-based names if not provided; prevents overwriting existing rules
  - `backup [rule-name-or-path]`: Accepts rule name (looks up in `~/.beaver-skill/beaver-claw-backup/`), relative path, or absolute path
  - `restore [rule-name-or-path]`: Rule-based restore with flexible rule reference
  - `restore <archive.tar.gz> <target-dir>`: Direct extraction mode without requiring a rule file

## 0.2.0

### Minor Changes

- d317d97: Publish `beaver-claw-backup` as the public npm CLI package `@beaverslab/claw-backup` and add workspace-based Changesets release automation.

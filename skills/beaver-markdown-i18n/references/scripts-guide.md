# Scripts Guide

Utility scripts for the translation pipeline. All scripts run with Node.js >= 18.

Install dependencies first:

```bash
cd <skill-path> && pnpm install
```

## Translation Pipeline CLI (`translate-cli.js`)

Unified CLI for the core translation workflow.

```bash
node $SKILL_DIR/scripts/translate-cli.js <command> [options]
```

### Commands

| Command          | Purpose                                            | Example                                          |
| ---------------- | -------------------------------------------------- | ------------------------------------------------ |
| `prepare`        | Generate skeleton target with TM caching & masking | `translate-cli.js prepare <src> <tgt> --lang zh` |
| `checkpoint`     | Persist one translated chunk into TM               | `translate-cli.js checkpoint <chunk-file>`       |
| `apply`          | Validate, unmask placeholders, update TM           | `translate-cli.js apply <src> <tgt>`             |
| `afterTranslate` | Run apply + quality + plan set done                | `translate-cli.js afterTranslate <src> <tgt>`    |
| `merge`          | Merge translated chunks into target                | `translate-cli.js merge <target>`                |
| `seed`           | Seed TM from existing translation pairs            | `translate-cli.js seed <src> <tgt> --lang zh`    |

### prepare

```bash
translate-cli.js prepare <source> <target> --lang <locale> [options]
```

| Option                | Description                                  |
| --------------------- | -------------------------------------------- |
| `--lang`              | Target locale (e.g. zh-CN, ja, ko)           |
| `--src-lang`          | Source locale (default: auto-detect or "en") |
| `--max-chunk-chars N` | Max characters per chunk (default: 3000)     |
| `--project-dir`       | Project root for .i18n/ config lookup        |

**Output:**

- Skeleton file(s) at target path with `<!-- i18n:todo -->` markers
- Task metadata at `.i18n/task-meta.json`
- Console summary: segments to translate vs cached

**Internally loads:** `.i18n/no-translate.yaml`, `.i18n/translation-consistency.yaml`, glossary.md, Translation Memory.

### checkpoint

```bash
translate-cli.js checkpoint <chunk-file> [--lang <locale>] [--project-dir .]
```

Checkpoint one translated chunk into Translation Memory before moving to the next chunk.

### apply

```bash
translate-cli.js apply <source> <target> [options]
```

| Option          | Description                                          |
| --------------- | ---------------------------------------------------- |
| `--lang`        | Target locale (auto-detected from task-meta or path) |
| `--src-lang`    | Source locale (default: auto-detect or "en")         |
| `--project-dir` | Project root for .i18n/ config lookup                |

**Checks performed (via lib/quality.js):**

- No remaining `<!-- i18n:todo -->` markers
- All `%%Pn%%` placeholders intact (restored to original)
- Code block count, content, and language tags preserved
- Heading count and link count match
- Variables (`{{var}}`, `$ENV`, `%s/%d`) preserved
- Frontmatter key match

**Output:** Per-file PASS/FAIL report, TM update summary.

### afterTranslate

```bash
translate-cli.js afterTranslate <source> <target> [--lang <locale>] [--project-dir .] [--allow-warnings]
```

Runs the post-translation sequence in one command:

- `apply`
- `quality`
- `plan set ... done`

Default behavior:

- stops on any quality `ERROR`
- stops on any quality `WARN`
- only continues past warnings when `--allow-warnings` is explicitly passed

### merge

```bash
translate-cli.js merge <target> [--project-dir .] [--dry-run]
```

Finds chunk files in `.i18n/chunks/` matching the target filename and merges them in order.

### seed

```bash
translate-cli.js seed <source> <target> --lang <locale> [--src-lang en] [--project-dir .]
```

Seed Translation Memory from existing translation pairs (one-time migration). No skeleton output.

---

## Quality Check CLI (`quality-cli.js`)

Comprehensive translation quality checker. Runs all automated checks from the quality checklist.

```bash
node $SKILL_DIR/scripts/quality-cli.js <source> <target> [options]
node $SKILL_DIR/scripts/quality-cli.js --dir <source_dir> <target_dir> [options]
```

### Options

| Option                   | Description                             |
| ------------------------ | --------------------------------------- |
| `--source-locale <code>` | Source locale (auto-detected from path) |
| `--target-locale <code>` | Target locale (auto-detected from path) |
| `--check <ids>`          | Only run these checks (comma-separated) |
| `--skip <ids>`           | Skip these checks (comma-separated)     |
| `--json`                 | JSON output                             |

### Check IDs

| ID                      | What it checks                                                       |
| ----------------------- | -------------------------------------------------------------------- |
| `structure`             | Headings, code block count, list items, frontmatter keys, link count |
| `codeBlocks`            | Code block content identical, language tags match                    |
| `variables`             | `{{var}}`, `$ENV`/`${var}`, `%s`/`%d` preserved                      |
| `links`                 | External URLs, relative links, anchor links preserved                |
| `terminology`           | no-translate terms, consistency terms, industry terms                |
| `untranslated`          | Detect untranslated source-language paragraphs                       |
| `sections`              | Heading hierarchy sequence match (section omission)                  |
| `frontmatterTranslated` | Frontmatter text fields translated (CJK targets)                     |

See `references/quality-checklist.md` for the full checklist with severity levels.

---

## Plan Management CLI (`plan-cli.js`)

Unified CLI for translation plan management.

```bash
node $SKILL_DIR/scripts/plan-cli.js <command> [options]
```

### Commands

| Command  | Purpose                           | Example                                            |
| -------- | --------------------------------- | -------------------------------------------------- |
| `init`   | Initialize translation session    | `plan-cli.js init docs/en --lang zh`               |
| `scan`   | Scan target files, build manifest | `plan-cli.js scan`                                 |
| `sync`   | Detect source file changes        | `plan-cli.js sync --mode git --from abc --to HEAD` |
| `add`    | Add files to plan                 | `plan-cli.js add guide.md`                         |
| `status` | Show progress overview            | `plan-cli.js status`                               |
| `list`   | Filter/sort files                 | `plan-cli.js list --status pending --sort lines`   |
| `set`    | Update file status                | `plan-cli.js set guide.md done`                    |
| `clean`  | Remove temp files                 | `plan-cli.js clean`                                |

### init

```bash
plan-cli.js init <source_dir> [--lang <locale>] [--output <path>]
```

- Creates `.i18n/runs/<timestamp>/` directory
- Auto-triggers `sync` then `scan`
- Creates empty plan if none exists

### scan

```bash
plan-cli.js scan [<target_dir>] [--lang <locale>]
```

Scans target directory, computes per-file `target_ratio` (target-language chars / (english chars + target-language chars), after stripping code blocks). Saves manifest to `.i18n/runs/<ts>/target-manifest.yaml`.

Reuses `target_hash`/`target_ratio` from plan entries when file hash hasn't changed.

### sync

```bash
plan-cli.js sync [<source_dir>] [--mode git|hash] [--from <commit>] [--to <commit>]
```

- **Git mode** (default): compares two commits, only looks at source_dir changes
- **Hash mode**: compares current file hashes against `source_hash` in plan

Unchanged files are not recorded in the plan.

### add

```bash
plan-cli.js add <source_file> [--status pending]
plan-cli.js add --match "gateway/*.md"
plan-cli.js add --file list.txt
```

### list

```bash
plan-cli.js list [--status <status>] [--sort lines|name] [--limit N] [--json]
```

`--status` supports comma-separated values: `--status pending,needs_update`

### set

```bash
plan-cli.js set <file_pattern> <status> [--notes "..."]
plan-cli.js set --batch --from pending --to in_progress [--match "gateway/*"]
```

Marking `done` auto-computes `target_hash` and `target_ratio`.

### clean

```bash
plan-cli.js clean [--all] [--keep-plan] [--dry-run]
```

Default: removes current run directory. `--all` removes all runs + plan file.

Never removes: `.i18n/no-translate.yaml`, `.i18n/translation-consistency.yaml`, `.i18n/<lang>.tm.jsonl`.

---

## Core Libraries (`scripts/lib/`)

All non-CLI modules live under `scripts/lib/`.

| Module                 | Purpose                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `prepare.js`           | Core preparation pipeline: TM lookup, masking, skeleton generation          |
| `apply.js`             | Post-processing pipeline: validation, unmasking, TM update                  |
| `merge-chunks.js`      | Merge translated chunk files back into a single target                      |
| `read-no-translate.js` | Load `.i18n/no-translate.yaml` config, `findI18nDir()` utility              |
| `quality.js`           | All quality check functions, `runAllChecks()` orchestrator                  |
| `plan.js`              | Plan file I/O, filtering, status updates, run dir management, sync logic    |
| `scan.js`              | Target file scanning, target_ratio computation, manifest I/O                |
| `tm.js`                | Translation Memory — JSONL load/save, cache key generation                  |
| `segments.js`          | Markdown AST parsing (remark/unified), segment extraction                   |
| `masking.js`           | Placeholder masking/unmasking for inline code, URLs, variables, code blocks |

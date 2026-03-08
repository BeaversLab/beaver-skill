# Scripts Guide

Utility scripts for the translation pipeline. All scripts run with Node.js >= 18.

Install dependencies first:
```bash
cd <skill-path> && pnpm install
```

## Pipeline Scripts (primary workflow)

| Script | Purpose | Usage |
|---|---|---|
| `prepare.js` | Pre-process source -> skeleton with TM cache | `node scripts/prepare.js <src> <tgt> --lang <locale>` |
| `apply.js` | Post-process: unmask, validate, update TM | `node scripts/apply.js <src> <tgt>` |
| `merge-chunks.js` | Merge translated chunks into target file | `node scripts/merge-chunks.js <target>` |

### prepare.js

Generate a skeleton target file with Translation Memory caching and placeholder masking.

```bash
# Single file
node scripts/prepare.js docs/en/guide.md docs/zh/guide.md --lang zh-CN

# Directory (batch)
node scripts/prepare.js docs/en/ docs/zh/ --lang zh-CN

# Seed TM from existing translations
node scripts/prepare.js --seed-tm docs/en/ docs/zh/ --lang zh-CN

# With explicit source locale
node scripts/prepare.js docs/en/ docs/zh/ --lang zh-CN --src-lang en
```

**Output:**
- Skeleton file(s) at target path with `<!-- i18n:todo -->` markers
- Task metadata at `.i18n/runs/<ts>/task-meta.json`
- Console summary: segments to translate vs cached

**Internally loads:** `.i18n/no-translate.yaml`, `.i18n/translation-consistency.yaml`, glossary.md, Translation Memory.

### apply.js

Validate translations, unmask placeholders, and update Translation Memory.

```bash
# Single file
node scripts/apply.js docs/en/guide.md docs/zh/guide.md

# Directory
node scripts/apply.js docs/en/ docs/zh/

# With explicit locale
node scripts/apply.js docs/en/guide.md docs/zh/guide.md --lang zh-CN
```

**Checks performed (via lib/quality.js):**
- No remaining `<!-- i18n:todo -->` markers
- All `%%Pn%%` placeholders intact (restored to original)
- Code block count, content, and language tags preserved
- Heading count and link count match
- Variables (`{{var}}`, `$ENV`, `%s/%d`) preserved
- Frontmatter key match

**Output:** Per-file PASS/FAIL report, TM update summary.

---

## Quality Check CLI (`i18n-quality`)

Comprehensive translation quality checker. Runs all automated checks from the quality checklist.

```bash
npx i18n-quality <source> <target> [options]
npx i18n-quality --dir <source_dir> <target_dir> [options]
```

### Options

| Option | Description |
|---|---|
| `--source-locale <code>` | Source locale (auto-detected from path) |
| `--target-locale <code>` | Target locale (auto-detected from path) |
| `--check <ids>` | Only run these checks (comma-separated) |
| `--skip <ids>` | Skip these checks (comma-separated) |
| `--json` | JSON output |

### Check IDs

| ID | What it checks |
|---|---|
| `structure` | Headings, code block count, list items, frontmatter keys, link count |
| `codeBlocks` | Code block content identical, language tags match |
| `variables` | `{{var}}`, `$ENV`/`${var}`, `%s`/`%d` preserved |
| `links` | External URLs, relative links, anchor links preserved |
| `terminology` | no-translate terms, consistency terms, industry terms |
| `untranslated` | Detect untranslated source-language paragraphs |
| `sections` | Heading hierarchy sequence match (section omission) |
| `frontmatterTranslated` | Frontmatter text fields translated (CJK targets) |

See `references/quality-checklist.md` for the full checklist with severity levels.

---

## Plan Management CLI (`i18n-plan`)

Unified CLI replacing the old `create-plan.js`, `update-plan.js`, `sync-plan.js`, and `list-remaining.js` scripts.

```bash
npx i18n-plan <command> [options]
```

### Commands

| Command | Purpose | Example |
|---|---|---|
| `init` | Initialize translation session | `i18n-plan init docs/en --lang zh` |
| `scan` | Scan target files, build manifest | `i18n-plan scan` |
| `sync` | Detect source file changes | `i18n-plan sync --mode git --from abc --to HEAD` |
| `add` | Add files to plan | `i18n-plan add guide.md` |
| `status` | Show progress overview | `i18n-plan status` |
| `list` | Filter/sort files | `i18n-plan list --status pending --sort lines` |
| `set` | Update file status | `i18n-plan set guide.md done` |
| `clean` | Remove temp files | `i18n-plan clean` |

### init

```bash
i18n-plan init <source_dir> [--lang <locale>] [--output <path>]
```

- Creates `.i18n/runs/<timestamp>/` directory
- Auto-triggers `sync` then `scan`
- Creates empty plan if none exists

### scan

```bash
i18n-plan scan [<target_dir>] [--lang <locale>]
```

Scans target directory, computes per-file `target_ratio` (target-language character proportion after stripping code blocks). Saves manifest to `.i18n/runs/<ts>/target-manifest.yaml`.

Reuses `target_hash`/`target_ratio` from plan entries when file hash hasn't changed.

### sync

```bash
i18n-plan sync [<source_dir>] [--mode git|hash] [--from <commit>] [--to <commit>]
```

- **Git mode** (default): compares two commits, only looks at source_dir changes
- **Hash mode**: compares current file hashes against `source_hash` in plan

Unchanged files are not recorded in the plan.

### add

```bash
i18n-plan add <source_file> [--status pending]
i18n-plan add --match "gateway/*.md"
i18n-plan add --file list.txt
```

### list

```bash
i18n-plan list [--status <status>] [--sort lines|name] [--limit N] [--json]
```

`--status` supports comma-separated values: `--status pending,needs_update`

### set

```bash
i18n-plan set <file_pattern> <status> [--notes "..."]
i18n-plan set --batch --from pending --to in_progress [--match "gateway/*"]
```

Marking `done` auto-computes `target_hash` and `target_ratio`.

### clean

```bash
i18n-plan clean [--all] [--keep-plan] [--dry-run]
```

Default: removes current run directory. `--all` removes all runs + plan file.

Never removes: `.i18n/no-translate.yaml`, `.i18n/translation-consistency.yaml`, `.i18n/<lang>.tm.jsonl`.

---

## Core Libraries (`scripts/lib/`)

| Module | Purpose |
|---|---|
| `quality.js` | All quality check functions, `runAllChecks()` orchestrator |
| `plan.js` | Plan file I/O, filtering, status updates, run dir management, sync logic |
| `scan.js` | Target file scanning, target_ratio computation, manifest I/O |
| `tm.js` | Translation Memory — JSONL load/save, cache key generation |
| `segments.js` | Markdown AST parsing (remark/unified), segment extraction |
| `masking.js` | Placeholder masking/unmasking for inline code, URLs, variables, code blocks |

---

## Deprecated Scripts

| Script | Replaced by |
|---|---|
| `create-plan.js` | `i18n-plan init` (deleted) |
| `update-plan.js` | `i18n-plan set` (deleted) |
| `list-remaining.js` | `i18n-plan list` (deleted) |
| `sync-plan.js` | `i18n-plan sync` (kept for backward compat, deprecated) |
| `validate.js` | `i18n-quality` (kept as thin wrapper, deprecated) |

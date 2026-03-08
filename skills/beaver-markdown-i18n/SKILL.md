---
name: markdown-i18n
description: Translate and sync markdown documentation between languages (EN↔ZH/JA/KO). Handles new document translation and incremental sync when source updates. Preserves code blocks, frontmatter structure, links, and variables. Use when translating docs, localizing markdown, syncing i18n files, or when the user mentions translation, localization, multilingual documentation, 翻译, ローカライズ, or 번역.
---

# Markdown i18n

Token-efficient translation pipeline. Scripts handle parsing, caching, masking, and validation — you only translate the marked segments.

## Workflow (3 steps)

All scenarios — single file, batch, incremental sync — use the same pipeline.

### Step 1: Prepare [MUST]

Run the prepare script to generate a skeleton target file:

```bash
# Single file
node scripts/prepare.js <source.md> <target.md> --lang <locale>

# Directory (batch / sync)
node scripts/prepare.js <source_dir/> <target_dir/> --lang <locale>

# Seed TM from existing translations (one-time migration)
node scripts/prepare.js --seed-tm <source_dir/> <target_dir/> --lang <locale>
```

**What prepare does internally (you do NOT need to do these):**
- Loads `.i18n/no-translate.yaml`, `.i18n/translation-consistency.yaml`, and glossary
- Loads Translation Memory (`.i18n/<lang>.tm.jsonl`)
- Parses source markdown into segments via AST
- Fills in cached translations from TM
- Masks inline code, URLs, variables as `%%Pn%%` placeholders
- Masks fenced code blocks as `%%CB_<hash>%%` placeholders — hash-based IDs derived from content, so they survive chunk reordering
- Marks untranslated segments with `<!-- i18n:todo -->` markers
- Large files (>80 TODOs): auto-splits into chunks in `.i18n/chunks/`
- Writes skeleton + task metadata to `.i18n/task-meta.json`

Review the console output — it shows segments to translate, cached count, and any chunks generated.

### Step 2: Translate [MUST]

Open the skeleton file (or chunk files for large documents). For each `<!-- i18n:todo -->` section, translate the content between the markers to the target language.

**Rules:**
1. Translate ONLY the text between `<!-- i18n:todo -->` and `<!-- /i18n:todo -->` markers
2. Keep `%%Pn%%` and `%%CB_<hash>%%` placeholders **exactly as-is** — do NOT modify, delete, or reformat them
3. Do NOT touch segments without markers (they are cached translations)
4. You do NOT need to remove the markers — `apply.js` strips them automatically

**Example — before:**
```markdown
<!-- i18n:todo -->
See [configuration]%%P2%% for %%P1%% flag details.
<!-- /i18n:todo -->
```

**Example — after:**
```markdown
<!-- i18n:todo -->
参阅[配置]%%P2%%了解 %%P1%% 标志详情。
<!-- /i18n:todo -->
```

> **WARNING — Placeholders:** `%%Pn%%` and `%%CB_<hash>%%` are restored to original content (inline code, URLs, code blocks) by the apply script. If you delete or modify them, the final document will be broken. When in doubt, leave them in place.

**Large files (chunked):** If prepare generated chunks in `.i18n/chunks/`, translate each chunk file in order. After all chunks are done, merge before applying:
```bash
node scripts/merge-chunks.js <target>
```

### Step 3: Apply [MUST]

Run the apply script to validate, unmask placeholders, and update TM:

```bash
node scripts/apply.js <source> <target> [--lang <locale>]
```

**What apply does internally:**
- Auto-strips remaining `<!-- i18n:todo -->` markers
- Auto-fixes common placeholder mangling (spacing, casing)
- Restores `%%Pn%%` → original inline code/URLs, `%%CB_<hash>%%` → original code blocks
- Validates: code block integrity, heading count, link count, variables, frontmatter keys
- Updates Translation Memory with new translations
- Reports structured results per file

**If validation fails:** fix the reported errors and re-run `apply.js`. Only after it passes is the file done.

### Step 3b: Full Quality Check (optional but recommended)

Run the full quality check CLI for comprehensive validation:

```bash
npx i18n-quality <source> <target> --target-locale <locale>
```

This runs all checks including terminology compliance, untranslated content detection, section omission, external/relative link preservation, and frontmatter value translation. See `references/quality-checklist.md` for the full check list.

---

## Configuration

### `.i18n/no-translate.yaml`

Terms, headings, and sections to keep in the source language:

```yaml
headings:
  - text: "API Reference"
    reason: "Industry standard term"

terms:
  - text: "Gateway"
    reason: "Product name"

sections:
  - title: "Changelog"
    reason: "Historical record"
```

### `.i18n/translation-consistency.yaml`

Mandatory term translations:

```yaml
translations:
  install:
    en: Install
    zh: 安装
    ja: インストール
    ko: 설치
```

### Translation Memory

Location: `.i18n/<lang>.tm.jsonl`

Segment-level cache. On subsequent runs, `prepare.js` skips segments whose source text hash matches a TM entry and pre-fills the cached translation — only changed or new segments get `<!-- i18n:todo -->` markers.

To seed TM from existing translations:
```bash
node scripts/prepare.js --seed-tm <source_dir> <target_dir> --lang <locale>
```

---

## Plan Management (`i18n-plan`)

Unified CLI for managing translation plans. Replaces the old `create-plan.js`, `update-plan.js`, `list-remaining.js` scripts.

```bash
npx i18n-plan <command> [options]
```

### Lifecycle

```bash
# 1. Initialize: create run dir, detect changes, scan targets
i18n-plan init <source_dir> --lang zh

# 2. Check progress
i18n-plan status

# 3. List files to translate (sorted by size)
i18n-plan list --status pending --sort lines

# 4. After translating a file, mark it done
i18n-plan set <file_pattern> done

# 5. Re-scan targets after batch completion
i18n-plan scan

# 6. Clean up temp files when plan is complete
i18n-plan clean
```

### Commands

| Command | Purpose |
|---|---|
| `init` | Create run dir, sync source changes, scan targets |
| `scan` | Scan target files, compute translation completeness |
| `sync` | Detect source file changes (git diff or hash mode) |
| `add` | Add files to the plan (single, glob, or file list) |
| `status` | Show overall progress with completeness metrics |
| `list` | Filter/sort files by status, size, name |
| `set` | Update file status (single or batch) |
| `clean` | Remove temp files (run directories) |

### Sync modes

```bash
# Git mode (default): compare two commits
i18n-plan sync --mode git --from abc1234 --to HEAD

# Hash mode: compare file hashes against plan records
i18n-plan sync --mode hash
```

### Run directories

Each `init` creates `.i18n/runs/<timestamp>/` for temporary files (task-meta, chunks, manifest). `clean` removes the current run directory.

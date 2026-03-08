# Quality Checklist

Use this checklist after EVERY file translation, BEFORE running the validation script.

## Pre-validation Self-check [MUST complete before saving]

### Structure
- [ ] Same number of headings (## / ###) as source
- [ ] Same number of code blocks as source
- [ ] Same number of list items as source (minor tolerance allowed)
- [ ] Frontmatter keys match source exactly (only values translated)

### Code Blocks
- [ ] Every code block content is byte-identical to source
- [ ] Code block language tags match source (```bash, ```yaml, etc.)
- [ ] No command-line flags or technical commands were translated inside or outside code blocks

### Variables and Placeholders
- [ ] All `{{variables}}` preserved exactly
- [ ] All `$ENV_VARS` and `${variables}` preserved exactly
- [ ] All `%s`, `%d` format specifiers preserved
- [ ] All `:param` URL parameters preserved

### Links
- [ ] Internal links have target locale prefix (`/zh/`, `/ja/`, etc.)
- [ ] No internal links still use source locale prefix (`/en/`)
- [ ] External URLs (http/https) are completely unchanged
- [ ] Relative links (`../`, `./`) are unchanged
- [ ] Anchor links preserved (path localized, anchor kept)

### Terminology
- [ ] Terms listed in `.i18n/no-translate.yaml` are kept in source language
- [ ] Terms listed in `.i18n/translation-consistency.yaml` use the exact specified translation
- [ ] Industry-standard terms (API, CLI, OAuth, JWT, etc.) kept in English

### Completeness
- [ ] No source-language paragraphs left untranslated
- [ ] No sections accidentally omitted
- [ ] Frontmatter values translated (not just keys)

## After Self-check

Run the validation script:

```bash
node scripts/validate.js <source.md> <target.md> --source-locale <src> --target-locale <tgt>
```

If validation fails, fix issues and re-run until all checks pass.

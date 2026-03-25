# Translation Rules

Detailed rules for translating markdown content between languages.

## Always Preserve (DO NOT translate)

1. **Code blocks** — Keep exactly as-is:

   ```bash
   openclaw status --all  # preserve entire block
   ```

2. **Technical commands/paths** in inline code:
   - `openclaw config get agents.defaults.models`
   - `/install#nodejs--npm-path-sanity`

3. **URLs** — Keep domain/path unchanged:
   - `https://openclaw.bot/install.sh`

4. **Variables/placeholders**:
   - `{{variable_name}}`
   - `$ENVIRONMENT_VAR`
   - `${variable}`
   - `%s`, `%d` (format specifiers)
   - `:param` (URL parameters)

5. **Command-line flags**:
   - `--verbose`, `--beta`, `-s`

6. **MDX/JSX components** — Keep component names and props unchanged:
   ```mdx
   <Callout type="warning">
     Only translate the text content inside, not the component tag or props.
   </Callout>
   ```

## Translate with Care

### Frontmatter

Translate values, keep keys in English:

```yaml
# EN
summary: "Troubleshooting hub: symptoms → checks → fixes"

# ZH
summary: "故障排查枢纽：症状 → 检查 → 修复"
```

### Internal Links

Link URLs are masked as placeholders and restored as-is. Locale prefix changes
(e.g. `/en/` → `/zh/`) are the project's responsibility (batch find-replace, build
scripts, etc.) and are **not** performed by this skill.

### Section Headings

Follow this decision flow for EVERY heading:

1. Is the heading in `.i18n/no-translate.yaml`?
   → YES: Keep in source language
2. Is it a product/brand name?
   → YES: Keep in source language
3. Is it an industry-standard term (API, CLI, OAuth)?
   → YES: Keep in source language
4. Otherwise → Translate to target language

**Translated heading anchors**: When translating a heading, note that different static site generators handle anchors differently. Keep the original English anchor as a comment or HTML anchor if the documentation system requires stable anchor IDs:

```markdown
## 安装指南 {#installation-guide}
```

### Technical Terms Strategy

| Term      | Keep in EN | Reason               |
| --------- | ---------- | -------------------- |
| Gateway   | Yes        | Product name         |
| CLI       | Yes        | Industry standard    |
| OAuth     | Yes        | Protocol name        |
| API       | Yes        | Industry standard    |
| webhook   | Yes        | Technical term       |
| allowlist | Yes        | Keep in code context |
| verbose   | Yes        | Keep in flag context |

For terms in `.i18n/translation-consistency.yaml`, always use the exact mapping specified.

## Handling Structural Changes (Sync)

| Change Type       | Action                                |
| ----------------- | ------------------------------------- |
| New section added | Translate and insert at same position |
| Section removed   | Remove from target                    |
| Section reordered | Reorder target to match               |
| Content updated   | Re-translate that section only        |

## Full Translation Example

**Source (EN):**

```markdown
---
summary: 'Quick start guide'
---

# Getting Started

Run the installer:

\`\`\`bash
curl -fsSL https://example.com/install.sh | bash
\`\`\`

See [configuration](/en/config) for options.

For more details:

- [Installation Guide](/en/install)
- [API Documentation](/api/reference)
- [External Resource](https://developer.mozilla.org)
```

**Target (ZH):**

```markdown
---
summary: '快速入门指南'
---

# 入门指南

运行安装器：

\`\`\`bash
curl -fsSL https://example.com/install.sh | bash
\`\`\`

参见[配置](/en/config)了解选项。

更多详情：

- [安装指南](/en/install)
- [API 文档](/api/reference)
- [外部资源](https://developer.mozilla.org)
```

**Key transformations:**

- Link URLs preserved as-is (locale prefix changes are the project's responsibility)
- `https://developer.mozilla.org` → unchanged (external URL)
- Code block content → unchanged
- Frontmatter key `summary` → unchanged, value translated

---
name: beaver-resource-compilation
description: Collect and compile markdown resources from multiple source directories into a single target with auto-generated frontmatter. Use when user says "收集资料", "汇编资料", "compile resources", "整理文档", or wants to organize scattered markdown files with metadata.
---

# Beaver Resource Compilation

从多个源目录收集 Markdown 文件，分析内容生成 frontmatter（title、tags、summary 等），重命名并移动到统一目标目录。

## 工作流程

```
资源汇编进度:
- [ ] Step 0: 加载配置 ⛔ BLOCKING
- [ ] Step 1: 扫描源目录，发现待编译文件
- [ ] Step 2: 逐文件分析，生成 title / tags / summary
- [ ] Step 3: 执行编译（添加 frontmatter + 重命名 + 移动）
- [ ] Step 4: 输出汇编报告
```

```
Input → [Step 0: Config] ─┬─ Found → Continue
                           └─ Not found → First-Time Setup ⛔ → Save config.yaml → Continue
        ↓
Scan sources → [Files found?] ─┬─ No → Report: 无待编译文件
                                └─ Yes → Analyze each file → Compile → Report
```

### Step 0: 加载配置 ⛔ BLOCKING

**⛔ 必须先完成配置，再执行后续步骤。**

检查配置文件：

```bash
test -f "$HOME/.beaver-skill/beaver-resource-compilation/config.yaml" && echo "found"
```

| 结果      | 操作                                  |
| --------- | ------------------------------------- |
| Found     | 读取配置，继续 Step 1                 |
| Not found | ⛔ 执行首次设置（见下方），完成后继续 |

**配置路径**: `~/.beaver-skill/beaver-resource-compilation/config.yaml`

**配置格式**:

```yaml
version: 1
sources:
  - /path/to/inbox1
  - /path/to/inbox2
target: /path/to/compiled
```

**首次设置**（配置不存在时）:

向用户询问：

1. **源目录**（支持多个）：收集 Markdown 文件的来源目录
2. **目标目录**（1个）：编译后文件的存放位置

将回答保存为 `config.yaml`，使用以下命令：

```bash
mkdir -p "$HOME/.beaver-skill/beaver-resource-compilation"
cat > "$HOME/.beaver-skill/beaver-resource-compilation/config.yaml" << 'EOF'
version: 1
sources:
  - <用户输入的源目录1>
  - <用户输入的源目录2>
target: <用户输入的目标目录>
EOF
```

### Step 1: 扫描源目录

**⛔ 确保依赖已安装**：首次运行时在 `skills/beaver-resource-compilation/` 目录下执行 `npm install`

运行扫描脚本：

```bash
node --import tsx scripts/scan.ts
```

脚本输出 JSON 数组，每个元素包含：

```json
{
  "path": "/abs/path/to/file.md",
  "filename": "file.md",
  "size": 1234,
  "existingAuthor": "Author Name or null",
  "existingDate": "2026-03-15T10:30 (from frontmatter or file birthtime)",
  "existingSource": "https://example.com or null"
}
```

- 已有 `compiled_at` 字段的文件会被自动跳过
- 如果输出为空数组 `[]`，报告无待编译文件并结束

### Step 2: 分析文件内容

对扫描结果中的每个文件：

1. **读取文件内容**
2. **分析生成以下字段**：
   - `title`: 简洁准确的中文或英文标题（根据内容语言）
   - `tags`: 3-8 个相关标签，涵盖主题、技术、领域
   - `summary`: 1-2 句话概括核心内容
3. **从扫描结果中获取**：
   - `author`: 使用 `existingAuthor`（可为空）
   - `created_at`: 使用 `existingDate`
   - `source`: 使用 `existingSource`（如为 null，脚本会自动使用源文件路径）

### Step 3: 执行编译

对每个文件调用编译脚本：

```bash
node --import tsx scripts/compile.ts \
  --file "/abs/path/to/file.md" \
  --title "生成的标题" \
  --tags "tag1,tag2,tag3" \
  --summary "生成的摘要" \
  --author "作者名" \
  --created-at "2026-03-15T10:30" \
  --source "https://example.com/article" \
  --yes
```

**参数说明**：

| 参数           | 必须 | 说明                                        |
| -------------- | ---- | ------------------------------------------- |
| `--file`       | 是   | 源文件绝对路径                              |
| `--title`      | 是   | Agent 生成的标题                            |
| `--tags`       | 是   | 逗号分隔的标签                              |
| `--summary`    | 是   | Agent 生成的摘要                            |
| `--author`     | 否   | 作者（来自 existingAuthor）                 |
| `--created-at` | 否   | 创建时间（来自 existingDate）               |
| `--source`     | 否   | 来源（来自 existingSource，缺省用文件路径） |
| `--yes`        | 否   | 跳过交互确认                                |

脚本会：

- 去除原有 frontmatter，添加新的标准 frontmatter
- 文件重命名为 `<title>.md`（空格替换为下划线）
- 将文件从源目录移动到目标目录
- 自动处理文件名冲突（追加数字后缀）

脚本成功输出：

```json
{ "success": true, "sourcePath": "...", "targetPath": "...", "newFilename": "..." }
```

### Step 4: 输出报告

所有文件处理完成后，输出汇编概况：

```
📋 资源汇编完成

总计: N 个文件 | ✓ 成功: X | ✗ 失败: Y

已汇编:
  ✓ source/file1.md → target/New_Title.md (author: 作者)
  ✓ source/file2.md → target/Another_Title.md (source: example.com)
  ✗ source/bad.md → 错误原因

目标目录: /path/to/target
```

## Frontmatter 规范

参见 [references/frontmatter-spec.md](references/frontmatter-spec.md)

## 技术栈

- **交互式 CLI**: `@clack/prompts` + `picocolors`
- **Frontmatter 解析**: `gray-matter`
- **配置管理**: `js-yaml`
- **运行时**: Node.js 20+ with `tsx`

# beaver-claw-backup

用于为 claw 类本地数据目录创建可复用的备份规则，并执行备份与恢复。

当前 MVP 内置 `openclaw` 预设，后续可以通过在 `references/default_rules/` 下新增 YAML 文件扩展其他 claw 类型。

## 功能概览

- 通过交互式 CLI 创建备份规则
- 规则文件使用 YAML 保存
- 备份输出为 `tar.gz`
- 支持按 claw 类型维护默认规则
- 支持从已有备份包恢复到指定目录

## 目录结构

```text
skills/beaver-claw-backup/
├── SKILL.md
├── README.zh-CN.md
├── references/
│   ├── default_rules/
│   │   └── openclaw.yaml
│   └── restore.md
packages/claw-backup/
├── package.json
├── scripts/
│   └── cli.ts
├── src/
│   ├── archive.ts
│   ├── cli.ts
│   ├── presets.ts
│   ├── rules.ts
│   └── yaml.ts
└── references/
    └── default_rules/
        └── openclaw.yaml
```

## 安装与运行

安装 CLI：

```bash
npm install -g @beaverslab/claw-backup
```

常用命令：

```bash
claw-backup init-rule
claw-backup backup
claw-backup restore
```

也可以直接临时执行：

```bash
npx @beaverslab/claw-backup init-rule
npx @beaverslab/claw-backup backup
npx @beaverslab/claw-backup restore
```

## 预设规则扩展

默认规则目录：

```text
packages/claw-backup/references/default_rules/
```

每个 claw 类型对应一个 YAML 文件。例如：

```text
references/default_rules/openclaw.yaml
```

文件示例：

```yaml
id: openclaw
label: OpenClaw
defaultSourceDir: ~/.openclaw
defaultBackupDir: ~/openclaw-backups
defaultRestoreDir: ~/.openclaw
archivePrefix: openclaw
include:
  - openclaw.json
  - credentials
  - agents
  - workspace
  - telegram
  - cron
exclude:
  - completions/
  - '*.log'
```

新增一种 claw 类型时，直接在该目录下增加一个新的 `.yaml` 文件即可。

## 创建规则文件

执行：

```bash
pnpm cli init-rule
```

CLI 会提示你选择 claw 类型：

- 选择预设类型时，会自动加载默认的 `source_dir`、`backup_dir`、`restore_dir`、`include`、`exclude`
- 选择 `other` 时，会要求输入自定义类型名和目录，并生成一个可手工编辑的 YAML 规则文件

规则文件默认保存在：

```text
~/.beaver-skill/beaver-claw-backup/
```

命名格式：

```text
<claw类型>_<时间戳>.yaml
```

例如：

```text
openclaw_202603011800.yaml
```

## 规则文件格式

示例：

```yaml
version: 1
claw_type: openclaw
created_at: 2026-03-01T10:00:00.000Z
source_dir: /Users/me/.openclaw
backup_dir: /Users/me/openclaw-backups
restore_dir: /Users/me/.openclaw
include:
  - openclaw.json
  - credentials
  - agents
  - workspace
  - telegram
  - cron
exclude:
  - completions/
  - '*.log'
archive_prefix: openclaw
```

字段说明：

- `source_dir`：要备份的根目录
- `backup_dir`：备份压缩包输出目录
- `restore_dir`：默认恢复目录
- `include`：相对于 `source_dir` 的包含规则
- `exclude`：相对于 `source_dir` 的排除规则
- `archive_prefix`：生成压缩包文件名前缀

## include / exclude 规则

### include 的语义

当前实现中，`include` 不是通用 glob 入口列表，而是“从哪些相对路径开始收集内容”。

有效示例：

```yaml
include:
  - openclaw.json
  - workspace
  - .
```

说明：

- 写文件名时，表示只包含该文件
- 写目录名时，表示递归包含该目录下内容
- 写 `.` 时，表示从 `source_dir` 根目录递归包含所有内容

注意：

```yaml
include:
  - '**/*'
```

当前实现下这通常不会按“匹配所有文件”生效。若要表达“包含整个源目录”，请使用：

```yaml
include:
  - .
```

### exclude 的语义

`exclude` 使用类似 `.gitignore` 的匹配规则。

例如：

```yaml
exclude:
  - completions/
  - '*.log'
  - a/*.tmp
```

### 优先级

`exclude` 优先级高于 `include`。

例如：

```yaml
include:
  - a/
exclude:
  - a/*.log
```

结果是：

- `a/` 目录下的普通文件会被备份
- `a/` 目录下匹配 `*.log` 的文件不会被备份

## 执行备份

执行：

```bash
pnpm cli backup
```

流程：

1. 选择一个规则文件
2. CLI 读取规则文件
3. 按 `include` 收集候选文件
4. 按 `exclude` 过滤不应备份的文件
5. 将最终文件列表打包为 `tar.gz`
6. 输出到规则中的 `backup_dir`

生成的压缩包文件名格式类似：

```text
openclaw_202603251310.tar.gz
```

## 执行恢复

执行：

```bash
pnpm cli restore
```

流程：

1. 选择规则文件
2. 选择备份包
3. 确认恢复目标目录，默认使用规则中的 `restore_dir`
4. 将压缩包内容解压到目标目录

## 恢复时的文件替换原则

当前恢复行为是“直接解压到目标目录”，不是“先删除目标目录再完整重建”。

这意味着：

- 恢复前不会自动清空目标目录
- 压缩包中存在的文件会被解压到目标目录
- 目标目录中原本存在但压缩包里没有的文件会继续保留
- 对于压缩包中与目标目录同名的文件，系统 `tar` 通常会用压缩包中的文件覆盖目标文件

因此当前恢复策略更接近：

```text
merge + 同名文件通常覆盖
```

而不是：

```text
replace entire directory
```

如果你希望恢复前先清空目录，需要在执行恢复前手动处理目标目录。

## 恢复前建议

在覆盖正在使用的数据目录前，建议：

1. 先停止对应服务或应用
2. 先备份当前目录
3. 再执行恢复

示例：

```bash
mv ~/.openclaw ~/.openclaw-before-restore
pnpm cli restore
```

更多说明可参考：

- [restore.md](./references/restore.md)

## 当前限制

- 当前仅内置 `openclaw` 预设
- `include` 目前不支持把 `**/*` 当作“全量 glob 入口”
- 恢复操作不会自动停止或重启外部服务
- 恢复操作不会自动删除目标目录中的旧文件

## 开发验证

本技能当前已通过以下验证：

- `pnpm test`
- `pnpm exec tsc -p tsconfig.json`

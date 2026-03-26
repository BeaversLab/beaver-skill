# Beaver Claw Backup (Beaver 备份与恢复)

[English](./README.en.md) | 简体中文

Beaver Claw Backup 是一个基于 YAML 规则的命令行工具，旨在帮助用户快速备份、迁移和恢复开发工具的数据或特定的文件夹（如 OpenClaw、Skill-Creator、Cursor 设置等）。

## 核心特性

- **极速体验**：优先支持 `bunx` 运行，无需安装，秒开任务。
- **预设丰富**：内置 OpenClaw、Cursor、VSCodium 等常用工具规则。
- **自定义灵活**：支持自定义备份路径、排除规则和恢复地址。
- **AI 友好**：提供非交互模式（`--yes`）和机器可读输出（`--json`）。

## 快速上手

### 1. 初始化规则 (Initialize)

为特定的工具或文件夹创建备份配置：

```bash
# 使用 Bun (推荐，更快速)
bunx @beaverslab/claw-backup init-rule --name my-cursor --preset cursor --yes

# 使用 Npx (如果没有安装 Bun)
npx @beaverslab/claw-backup@latest init-rule --name my-cursor --preset cursor --yes
```

### 2. 执行备份 (Backup)

根据已有的规则运行备份：

```bash
# 自动备份 my-cursor 规则定义的内容
bunx @beaverslab/claw-backup backup my-cursor --yes
```

### 3. 恢复数据 (Restore)

将备份文件还原到指定位置：

```bash
# 还原到规则默认地址
bunx @beaverslab/claw-backup restore my-cursor --yes

# 还原到指定新位置
bunx @beaverslab/claw-backup restore my-cursor ~/new-location --yes
```

## 常用参数说明

| 参数               | 描述                                         |
| :----------------- | :------------------------------------------- |
| `-y, --yes`        | 跳过确认提示，直接执行（脚本/AI 调用必备）。 |
| `--json`           | 以 JSON 格式输出结果，方便程序解析。         |
| `--archive <path>` | 恢复时指定特定的 `.tar.gz` 文件。            |
| `--name <name>`    | 指定规则文件的名称（默认为时间戳）。         |

## 存储位置

- **规则文件**：`~/.beaver-skill/beaver-claw-backup/`
- **默认备份目录**：通常在 `~/claw-backups/` 或自定义路径下。

---

_Powered by BeaversLab_

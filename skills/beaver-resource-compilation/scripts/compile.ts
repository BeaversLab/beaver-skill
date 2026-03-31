import { readFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import matter from 'gray-matter';
import { loadConfig, CONFIG_PATH } from './config.js';

interface CompileArgs {
  file: string;
  title: string;
  tags: string[];
  summary: string;
  author?: string;
  createdAt?: string;
  source?: string;
  yes: boolean;
}

function parseArgs(): CompileArgs {
  const args = process.argv.slice(2);
  const result: CompileArgs = { file: '', title: '', tags: [], summary: '', yes: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => args[++i];
    switch (arg) {
      case '--file':
        result.file = next();
        break;
      case '--title':
        result.title = next();
        break;
      case '--tags':
        result.tags = next()
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        break;
      case '--summary':
        result.summary = next();
        break;
      case '--author':
        result.author = next();
        break;
      case '--created-at':
        result.createdAt = next();
        break;
      case '--source':
        result.source = next();
        break;
      case '--yes':
      case '-y':
        result.yes = true;
        break;
    }
  }

  return result;
}

function nowDatetime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractDomain(urlStr: string): string | null {
  try {
    const hostname = new URL(urlStr).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isUrl(str: string): boolean {
  return /^https?:\/\//i.test(str);
}

function computeContentHash(content: string): string {
  return createHash('sha256').update(content.trim()).digest('hex').slice(0, 16);
}

function toFilename(title: string): string {
  return title.replace(/\s+/g, '_').replace(/[\/\\:*?"<>|]/g, '') + '.md';
}

function deduplicateFilename(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name;

  const base = name.replace(/\.md$/, '');
  let counter = 1;
  while (existsSync(join(dir, `${base}_${counter}.md`))) {
    counter++;
  }
  return `${base}_${counter}.md`;
}

export interface CompileResult {
  success: boolean;
  sourcePath: string;
  targetPath: string;
  newFilename: string;
  error?: string;
}

export async function compileFile(args: CompileArgs, targetDir: string): Promise<CompileResult> {
  const { file, title, tags, summary, author, createdAt, source } = args;

  try {
    const raw = await readFile(file, 'utf-8');
    const { content } = matter(raw);

    const resolvedSource = source || file;
    const frontmatter: Record<string, unknown> = {
      title,
      tags,
      summary,
    };

    if (author) frontmatter.author = author;
    if (createdAt) frontmatter.created_at = createdAt;
    frontmatter.compiled_at = nowDatetime();
    frontmatter.source = resolvedSource;

    if (isUrl(resolvedSource)) {
      const domain = extractDomain(resolvedSource);
      if (domain) frontmatter.source_domain = domain;
    }

    frontmatter.content_hash = computeContentHash(content);

    const fmLines = ['---'];
    fmLines.push(`title: "${frontmatter.title}"`);
    fmLines.push('tags:');
    for (const tag of tags) {
      fmLines.push(`  - ${tag}`);
    }
    fmLines.push(`summary: "${frontmatter.summary}"`);
    if (frontmatter.author) fmLines.push(`author: "${frontmatter.author}"`);
    if (frontmatter.created_at) fmLines.push(`created_at: "${frontmatter.created_at}"`);
    fmLines.push(`compiled_at: "${frontmatter.compiled_at}"`);
    fmLines.push(`source: "${frontmatter.source}"`);
    if (frontmatter.source_domain) fmLines.push(`source_domain: "${frontmatter.source_domain}"`);
    fmLines.push(`content_hash: "${frontmatter.content_hash}"`);
    fmLines.push('---');

    const newContent = fmLines.join('\n') + '\n\n' + content.trim() + '\n';

    const rawFilename = toFilename(title);
    const newFilename = deduplicateFilename(targetDir, rawFilename);
    const targetPath = join(targetDir, newFilename);

    await mkdir(targetDir, { recursive: true });

    const tmpPath = targetPath + '.tmp';
    const { writeFile: writeFs } = await import('node:fs/promises');
    await writeFs(tmpPath, newContent, 'utf-8');

    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(file);
    } catch {
      await unlink(tmpPath);
      return {
        success: false,
        sourcePath: file,
        targetPath,
        newFilename,
        error: 'Failed to remove source file',
      };
    }

    await rename(tmpPath, targetPath);

    return { success: true, sourcePath: file, targetPath, newFilename };
  } catch (err) {
    return {
      success: false,
      sourcePath: file,
      targetPath: '',
      newFilename: '',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function main() {
  const args = parseArgs();

  if (!args.file || !args.title) {
    console.error(
      pc.red(
        'Usage: compile.ts --file <path> --title <title> --tags <t1,t2> --summary <text> [--author <name>] [--created-at <dt>] [--source <url>] [--yes]'
      )
    );
    process.exit(1);
  }

  const config = await loadConfig();
  if (!config) {
    console.error(pc.red(`✗ Config not found at ${CONFIG_PATH}`));
    process.exit(1);
  }

  const targetDir = config.target;

  if (!args.yes) {
    p.intro(pc.bgCyan(pc.black(' beaver-resource-compilation ')));

    const newFilename = toFilename(args.title);
    p.log.info(`${pc.bold(basename(args.file))} → ${pc.green(newFilename)}`);
    p.log.info(`  title: ${args.title}`);
    p.log.info(`  tags: ${args.tags.join(', ')}`);
    if (args.author) p.log.info(`  author: ${args.author}`);
    p.log.info(`  target: ${targetDir}`);

    const confirmed = await p.confirm({ message: '确认编译此文件？' });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('已取消');
      process.exit(0);
    }
  }

  const result = await compileFile(args, targetDir);

  if (result.success) {
    console.log(
      JSON.stringify({
        success: true,
        sourcePath: result.sourcePath,
        targetPath: result.targetPath,
        newFilename: result.newFilename,
      })
    );
  } else {
    console.error(
      JSON.stringify({ success: false, sourcePath: result.sourcePath, error: result.error })
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(pc.red(err.message));
  process.exit(1);
});

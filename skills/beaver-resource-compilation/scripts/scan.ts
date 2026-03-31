import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import matter from 'gray-matter';
import pc from 'picocolors';
import { loadConfig, CONFIG_PATH } from './config.js';

export interface ScannedFile {
  path: string;
  filename: string;
  size: number;
  existingAuthor: string | null;
  existingDate: string | null;
  existingSource: string | null;
}

const DATE_FIELDS = ['date', 'created_at', 'created'];
const SOURCE_FIELDS = ['source', 'url', 'link'];

function formatBirthtime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resolveDate(data: Record<string, unknown>): string | null {
  for (const key of DATE_FIELDS) {
    const val = data[key];
    if (val instanceof Date) return formatBirthtime(val);
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

function resolveSource(data: Record<string, unknown>): string | null {
  for (const key of SOURCE_FIELDS) {
    const val = data[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

async function scanDirectory(dir: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  const absDir = resolve(dir);

  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    console.error(pc.yellow(`⚠ Cannot read directory: ${absDir}`));
    return results;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const filePath = join(absDir, entry.name);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const { data } = matter(raw);

      if (data && data.compiled_at) continue;

      const fileStat = await stat(filePath);
      const frontmatterDate = resolveDate(data ?? {});
      const existingDate = frontmatterDate ?? formatBirthtime(fileStat.birthtime);

      results.push({
        path: filePath,
        filename: entry.name,
        size: fileStat.size,
        existingAuthor:
          typeof data?.author === 'string' && data.author.trim() ? data.author.trim() : null,
        existingDate,
        existingSource: resolveSource(data ?? {}),
      });
    } catch {
      console.error(pc.yellow(`⚠ Cannot read file: ${filePath}`));
    }
  }

  return results;
}

async function main() {
  const config = await loadConfig();
  if (!config) {
    console.error(pc.red(`✗ Config not found at ${CONFIG_PATH}`));
    console.error(pc.dim('Run first-time setup via the agent or create config.yaml manually.'));
    process.exit(1);
  }

  const allFiles: ScannedFile[] = [];
  for (const source of config.sources) {
    const files = await scanDirectory(source);
    allFiles.push(...files);
  }

  console.log(JSON.stringify(allFiles, null, 2));
}

main().catch((err) => {
  console.error(pc.red(err.message));
  process.exit(1);
});

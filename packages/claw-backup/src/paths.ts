import os from 'node:os';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

export const RULES_DIR = path.join(os.homedir(), '.beaver-skill', 'beaver-claw-backup');

export function expandHome(input: string): string {
  if (input === '~') {
    return os.homedir();
  }
  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function currentTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const hour = `${now.getHours()}`.padStart(2, '0');
  const minute = `${now.getMinutes()}`.padStart(2, '0');
  return `${year}${month}${day}${hour}${minute}`;
}

export function sanitizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom-claw';
}

export async function ensureRulesDir(): Promise<string> {
  await mkdir(RULES_DIR, { recursive: true });
  return RULES_DIR;
}

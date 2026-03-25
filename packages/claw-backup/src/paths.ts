import os from 'node:os';
import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';

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

/**
 * Check if a path is an absolute path.
 */
export function isAbsolutePath(input: string): boolean {
  return path.isAbsolute(input);
}

/**
 * Check if a string looks like a path (contains / or .) rather than a simple name.
 */
export function looksLikePath(input: string): boolean {
  return input.includes('/') || input.includes(path.sep);
}

/**
 * Resolve a name or path to a full rule file path.
 * - Absolute path → returned as-is
 * - Relative path (contains / or .) → resolved to absolute path
 * - Name → looks for {name}.yaml in RULES_DIR
 * @throws Error if name is provided but file doesn't exist
 */
export async function resolveRulePath(nameOrPath: string): Promise<string> {
  const expanded = expandHome(nameOrPath);

  // Absolute path: return as-is
  if (isAbsolutePath(expanded)) {
    return expanded;
  }

  // Relative path (contains separator): resolve relative to cwd
  if (looksLikePath(expanded)) {
    return path.resolve(expanded);
  }

  // Otherwise treat as name: look in RULES_DIR
  const rulePath = path.join(RULES_DIR, `${expanded}.yaml`);
  const info = await stat(rulePath).catch(() => null);
  if (!info) {
    throw new Error(
      `Rule file not found: ${rulePath}\nDid you mean a path? Use "./${nameOrPath}" for relative paths.`
    );
  }
  return rulePath;
}

/**
 * Check if a rule file with the given name exists in RULES_DIR.
 */
export async function ruleFileExists(name: string): Promise<boolean> {
  const rulePath = path.join(RULES_DIR, `${name}.yaml`);
  const info = await stat(rulePath).catch(() => null);
  return !!info;
}

/**
 * Check if a path points to a tar.gz archive.
 */
export function isArchivePath(input: string): boolean {
  return input.endsWith('.tar.gz') || input.endsWith('.tgz');
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
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'custom-claw'
  );
}

export async function ensureRulesDir(): Promise<string> {
  await mkdir(RULES_DIR, { recursive: true });
  return RULES_DIR;
}

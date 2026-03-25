import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import type { ClawPreset } from './types.js';

function resolvePresetDir(): string {
  const candidates = [
    path.resolve(import.meta.dirname, '../references/default_rules'),
    path.resolve(import.meta.dirname, '../../references/default_rules'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

const presetDir = resolvePresetDir();

function assertPreset(value: unknown, filePath: string): ClawPreset {
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid preset in ${filePath}: expected a YAML object.`);
  }

  const preset = value as Partial<ClawPreset>;
  const requiredStringFields: Array<keyof ClawPreset> = [
    'id',
    'label',
    'defaultSourceDir',
    'defaultBackupDir',
    'defaultRestoreDir',
  ];
  for (const field of requiredStringFields) {
    if (typeof preset[field] !== 'string' || !preset[field]?.trim()) {
      throw new Error(`Invalid preset in ${filePath}: "${field}" must be a non-empty string.`);
    }
  }
  if (!Array.isArray(preset.include) || !preset.include.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid preset in ${filePath}: "include" must be a string array.`);
  }
  if (!Array.isArray(preset.exclude) || !preset.exclude.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid preset in ${filePath}: "exclude" must be a string array.`);
  }
  return preset as ClawPreset;
}

function loadPresets(): ClawPreset[] {
  const files = readdirSync(presetDir)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort();
  return files.map((name) => {
    const filePath = path.join(presetDir, name);
    const parsed = parseDocument(readFileSync(filePath, 'utf8')).toJS();
    return assertPreset(parsed, filePath);
  });
}

const catalog = loadPresets();

export function listPresets(): ClawPreset[] {
  return catalog.slice();
}

export function getPreset(id: string): ClawPreset | undefined {
  return catalog.find((preset) => preset.id === id);
}

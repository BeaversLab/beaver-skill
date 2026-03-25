import path from 'node:path';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import {
  expandHome,
  currentTimestamp,
  ensureRulesDir,
  sanitizeName,
  ruleFileExists,
  RULES_DIR,
} from './paths.js';
import { getPreset, listPresets } from './presets.js';
import { parseRuleYaml, serializeRule } from './yaml.js';
import type { BackupRule, ClawPreset, CreateRuleResult } from './types.js';

export function createRuleFromPreset(preset: ClawPreset): BackupRule {
  return {
    version: 1,
    clawType: preset.id,
    createdAt: new Date().toISOString(),
    sourceDir: expandHome(preset.defaultSourceDir),
    backupDir: expandHome(preset.defaultBackupDir),
    restoreDir: expandHome(preset.defaultRestoreDir),
    include: preset.include.slice(),
    exclude: preset.exclude.slice(),
    archivePrefix: preset.archivePrefix,
  };
}

export function createCustomRule(
  clawType: string,
  sourceDir: string,
  backupDir: string
): BackupRule {
  const normalizedType = sanitizeName(clawType);
  return {
    version: 1,
    clawType: normalizedType,
    createdAt: new Date().toISOString(),
    sourceDir: expandHome(sourceDir),
    backupDir: expandHome(backupDir),
    restoreDir: expandHome(sourceDir),
    include: [],
    exclude: [],
    archivePrefix: normalizedType,
  };
}

export async function saveRule(
  rule: BackupRule,
  options?: { includeComment?: string; customName?: string }
): Promise<string> {
  const dir = await ensureRulesDir();
  let filename: string;

  if (options?.customName) {
    const sanitizedName = sanitizeName(options.customName);
    filename = `${sanitizedName}.yaml`;
    const rulePath = path.join(dir, filename);
    // Check if file already exists
    if (await ruleFileExists(sanitizedName)) {
      throw new Error(
        `Rule file "${sanitizedName}.yaml" already exists. Choose a different name or delete the existing file first.`
      );
    }
    await writeFile(rulePath, serializeRule(rule, options), 'utf8');
    return rulePath;
  }

  // Default: use timestamp-based naming
  filename = `${sanitizeName(rule.clawType)}_${currentTimestamp()}.yaml`;
  const rulePath = path.join(dir, filename);
  await writeFile(rulePath, serializeRule(rule, options), 'utf8');
  return rulePath;
}

export async function createRuleFile(params: {
  presetId?: string;
  clawType?: string;
  sourceDir?: string;
  backupDir?: string;
  customName?: string;
}): Promise<CreateRuleResult> {
  if (params.presetId && params.presetId !== 'other') {
    const preset = getPreset(params.presetId);
    if (!preset) {
      throw new Error(`Unknown preset "${params.presetId}".`);
    }
    const rule = createRuleFromPreset(preset);
    const rulePath = await saveRule(rule, { customName: params.customName });
    return { rule, rulePath, needsManualEditing: false };
  }

  if (!params.clawType || !params.sourceDir || !params.backupDir) {
    throw new Error('Custom rule creation requires clawType, sourceDir, and backupDir.');
  }

  const rule = createCustomRule(params.clawType, params.sourceDir, params.backupDir);
  const rulePath = await saveRule(rule, {
    customName: params.customName,
    includeComment:
      'Custom claw types start with an empty include list. Edit this file before running backup.',
  });
  return { rule, rulePath, needsManualEditing: true };
}

export async function loadRule(rulePath: string): Promise<BackupRule> {
  const raw = await readFile(rulePath, 'utf8');
  return parseRuleYaml(raw);
}

export async function listRuleFiles(): Promise<string[]> {
  await ensureRulesDir();
  const entries = await readdir(RULES_DIR, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) => entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))
    )
    .map((entry) => path.join(RULES_DIR, entry.name));
  files.sort((left, right) => right.localeCompare(left));
  return files;
}

export async function validateRuleSource(rule: BackupRule): Promise<void> {
  const info = await stat(rule.sourceDir).catch(() => null);
  if (!info || !info.isDirectory()) {
    throw new Error(`Source directory not found: ${rule.sourceDir}`);
  }
  if (rule.include.length === 0) {
    throw new Error(
      'Rule file has no include entries. Edit the YAML file and add files or directories to back up.'
    );
  }
}

export function availablePresetChoices(): Array<{ value: string; label: string; hint?: string }> {
  return [
    ...listPresets().map((preset) => ({
      value: preset.id,
      label: preset.label,
      hint: preset.defaultSourceDir,
    })),
    {
      value: 'other',
      label: 'Other',
      hint: 'Create a custom rule file',
    },
  ];
}

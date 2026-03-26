import path from 'node:path';
import {
  cancel,
  confirm,
  intro,
  isCancel,
  note,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
import {
  availablePresetChoices,
  createRuleFile,
  listRuleFiles,
  loadRule,
  validateRuleSource,
} from './rules.js';
import { expandHome, resolveRulePath, isArchivePath, ruleFileExists } from './paths.js';
import { createBackup, listArchives, restoreArchive } from './archive.js';

function usage(): void {
  console.log(`Usage:
  claw-backup init-rule [--name <name>] [--preset <id>] [--type <type>] [--src <path>] [--dest <path>]
  claw-backup backup <rule-name-or-path> [--yes] [--json]
  claw-backup restore <rule-name-or-path> [target-dir] [--archive <path>] [--yes] [--json]
  claw-backup restore <archive.tar.gz> <target-dir> [--yes] [--json]

Options:
  -y, --yes          Skip confirmation prompts (AI-friendly)
  --json             Output result as JSON (Machine-friendly)
  --preset <id>      Preset ID (e.g., openclaw, cursor)
  --type <name>      Custom claw type name
  --src <path>       Source directory for custom rule
  --dest <path>      Backup directory for custom rule
  --archive <path>   Specific archive file to restore
`);
}

/**
 * Global flags for the current execution
 */
let IS_JSON = false;
let IS_YES = false;

/**
 * Output helper to balance human and machine readability
 */
function outputResult(humanMsg: string, machineData: object): void {
  if (IS_JSON) {
    console.log(JSON.stringify(machineData));
  } else if (IS_YES) {
    console.log(humanMsg);
  } else {
    // Already handled by clack notes/outro
  }
}

/**
 * Error helper
 */
function exitWithError(message: string): never {
  if (IS_JSON) {
    console.error(JSON.stringify({ error: message, success: false }));
  } else {
    if (IS_YES) {
      console.error(`Error: ${message}`);
    } else {
      note(message, 'Error');
      cancel('Operation failed.');
    }
  }
  process.exit(1);
}

/**
 * Helper to get flag value from argv
 */
function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('-')) {
    return args[index + 1];
  }
  return undefined;
}

async function promptForRuleFile(initialPath?: string, nonInteractive = false): Promise<string> {
  if (initialPath) {
    try {
      return await resolveRulePath(initialPath);
    } catch (error) {
      if (nonInteractive) throw error;
      const message = error instanceof Error ? error.message : String(error);
      note(message, 'Warning: Provided rule name/path not found');
    }
  }

  if (nonInteractive) {
    throw new Error('Rule file must be provided in non-interactive mode.');
  }

  const ruleFiles = await listRuleFiles();
  if (ruleFiles.length === 0) {
    throw new Error(
      'No rule files found in ~/.beaver-skill. Run "init-rule" first or provide a file path.'
    );
  }
  const selected = await select({
    message: 'Select a rule file from standard location',
    options: ruleFiles.map((file) => ({
      value: file,
      label: path.basename(file),
      hint: file,
    })),
  });
  return asString(selected);
}

async function promptForArchive(
  ruleFile: string,
  backupDir: string,
  initialPath?: string,
  nonInteractive = false
): Promise<string> {
  if (initialPath) {
    const expanded = path.resolve(expandHome(initialPath));
    const info = await import('node:fs/promises').then((fs) => fs.stat(expanded)).catch(() => null);
    if (info && info.isFile()) {
      return expanded;
    }
    if (nonInteractive) {
      throw new Error(`Archive file not found: ${expanded}`);
    }
    note(`Archive file not found at: ${expanded}`, 'Warning');
  }

  const ruleName = path.basename(ruleFile, '.yaml');
  const archives = await listArchives(backupDir, ruleName);

  if (nonInteractive) {
    if (archives.length === 1) return archives[0];
    if (archives.length > 1)
      throw new Error('Multiple archives found. Specify one with --archive.');
    throw new Error(`No archives found for rule "${ruleName}" in ${backupDir}`);
  }

  if (archives.length === 0) {
    const input = await text({
      message: 'No archives found for this rule. Enter archive path manually',
      placeholder: path.join(backupDir, `${ruleName}_202603011800.tar.gz`),
      validate(value) {
        return value.trim() ? undefined : 'Archive path is required.';
      },
    });
    return path.resolve(expandHome(asString(input)));
  }

  const selected = await select({
    message: `Select an archive for "${path.basename(ruleFile)}"`,
    options: archives.map((archive) => ({
      value: archive,
      label: path.basename(archive),
      hint: archive,
    })),
  });
  return asString(selected);
}

interface InitOptions {
  name?: string;
  preset?: string;
  type?: string;
  src?: string;
  dest?: string;
  nonInteractive?: boolean;
}

async function handleInitRule(options: InitOptions): Promise<void> {
  const { name, preset, type, src, dest, nonInteractive } = options;

  if (!nonInteractive) intro('Initialize backup rule');

  let selectedPreset = preset;
  if (!selectedPreset) {
    if (nonInteractive) throw new Error('--preset is required in non-interactive mode.');
    const choice = await select({
      message: 'Select claw type',
      options: availablePresetChoices(),
    });
    selectedPreset = asString(choice);
  }

  let customName = name;
  if (!customName && !nonInteractive) {
    const nameInput = await text({
      message: 'Rule name (optional, press Enter for default)',
      placeholder: selectedPreset === 'other' ? 'my-rule' : selectedPreset,
    });
    const trimmed = asString(nameInput).trim();
    if (trimmed) customName = trimmed;
  }

  if (customName && (await ruleFileExists(customName))) {
    if (nonInteractive) {
      outputResult(`Rule "${customName}" already exists. Skipping.`, {
        success: true,
        status: 'skipped',
        path: customName,
      });
      return;
    }
    const overwrite = await confirm({
      message: `Rule "${customName}" already exists. Overwrite?`,
      initialValue: false,
    });
    if (isCancel(overwrite) || !overwrite) {
      cancel('Operation aborted.');
      process.exit(0);
    }
  }

  if (selectedPreset !== 'other') {
    const created = await createRuleFile({ presetId: selectedPreset, customName });
    if (!nonInteractive) {
      note(created.rulePath, 'Rule file saved to');
      outro('Rule initialized.');
    } else {
      outputResult(`Rule initialized: ${created.rulePath}`, {
        success: true,
        path: created.rulePath,
      });
    }
    return;
  }

  // Handle 'other' type
  const clawType =
    type ||
    (nonInteractive
      ? undefined
      : asString(
          await text({
            message: 'Custom claw type name',
            validate: (v) => (v.trim() ? undefined : 'Required'),
          })
        ));
  const sourceDir =
    src ||
    (nonInteractive
      ? undefined
      : asString(
          await text({
            message: 'Source directory',
            validate: (v) => (v.trim() ? undefined : 'Required'),
          })
        ));
  const backupDir =
    dest ||
    (nonInteractive
      ? undefined
      : asString(
          await text({
            message: 'Backup output directory',
            initialValue: '~/claw-backups',
            validate: (v) => (v.trim() ? undefined : 'Required'),
          })
        ));

  if (!clawType || !sourceDir || !backupDir) {
    throw new Error('Missing required parameters for custom rule: --type, --src, --dest');
  }

  const created = await createRuleFile({
    presetId: 'other',
    clawType,
    sourceDir,
    backupDir,
    customName,
  });

  if (!nonInteractive) {
    note(created.rulePath, 'Rule file saved to');
    note('Edit the YAML file to add "include" entries.', 'Manual action required');
    outro('Custom rule initialized.');
  } else {
    outputResult(`Custom rule initialized: ${created.rulePath}`, {
      success: true,
      path: created.rulePath,
    });
  }
}

async function handleBackup(ruleArg?: string, nonInteractive = false): Promise<void> {
  if (!nonInteractive) intro('Run claw backup');

  const rulePath = await promptForRuleFile(ruleArg, nonInteractive);
  const rule = await loadRule(rulePath);
  await validateRuleSource(rule);

  const ruleName = path.basename(rulePath, '.yaml');

  if (!nonInteractive) {
    const proceed = await confirm({
      message: `Run backup for "${ruleName}" (Source: ${rule.sourceDir})?`,
      initialValue: true,
    });
    if (isCancel(proceed) || !proceed) {
      cancel('Backup aborted.');
      process.exit(0);
    }
  }

  const progress = !nonInteractive && !IS_JSON ? spinner() : null;
  progress?.start('Creating tar.gz archive');
  const result = await createBackup(rulePath, rule, ruleName);
  progress?.stop(`Archive created: ${path.basename(result.archivePath)}`);

  if (!nonInteractive) {
    note(result.archivePath, 'Archive path');
    outro('Backup completed.');
  } else {
    outputResult(`Backup completed: ${result.archivePath}`, {
      success: true,
      archive: result.archivePath,
      fileCount: result.fileCount,
    });
  }
}

async function handleRestore(
  arg1?: string,
  arg2?: string,
  options: { archive?: string; yes?: boolean } = {}
): Promise<void> {
  const nonInteractive = options.yes || false;

  // Mode 2: Direct extraction (archive.tar.gz target-dir)
  if (arg1 && isArchivePath(arg1) && arg2) {
    const archivePath = path.resolve(expandHome(arg1));
    const targetDir = path.resolve(expandHome(arg2));

    if (!nonInteractive) {
      intro('Direct archive extraction');
      const proceed = await confirm({
        message: `Extract "${path.basename(archivePath)}" into ${targetDir}?`,
        initialValue: false,
      });
      if (isCancel(proceed) || !proceed) {
        cancel('Restore aborted.');
        process.exit(0);
      }
    }

    const progress = !nonInteractive && !IS_JSON ? spinner() : null;
    progress?.start('Extracting archive');
    const result = await restoreArchive(archivePath, targetDir);
    progress?.stop('Restore finished');

    if (!nonInteractive) {
      note(result.targetDir, 'Restored into');
      outro('Restore completed.');
    } else {
      outputResult(`Restore completed into: ${result.targetDir}`, {
        success: true,
        targetDir: result.targetDir,
        archive: archivePath,
      });
    }
    return;
  }

  // Mode 1: Rule-based restore
  if (!nonInteractive) intro('Restore from backup');

  let rulePath: string;
  try {
    rulePath = await promptForRuleFile(arg1, nonInteractive);
  } catch (err) {
    if (arg1 && isArchivePath(arg1)) {
      exitWithError(
        `To restore from an archive without a rule, use: restore <archive> <target-dir>`
      );
    }
    throw err;
  }

  const rule = await loadRule(rulePath);
  const archivePath = await promptForArchive(
    rulePath,
    rule.backupDir,
    options.archive,
    nonInteractive
  );

  const initialTarget = arg2 || rule.restoreDir;
  let targetDir = path.resolve(expandHome(initialTarget));

  if (!nonInteractive) {
    const targetDirInput = await text({
      message: 'Confirm restore target directory',
      initialValue: initialTarget,
      validate: (v) => (v.trim() ? undefined : 'Required'),
    });
    targetDir = path.resolve(expandHome(asString(targetDirInput)));

    const proceed = await confirm({
      message: `Restore "${path.basename(archivePath)}" into ${targetDir}?`,
      initialValue: false,
    });
    if (isCancel(proceed) || !proceed) {
      cancel('Restore aborted.');
      process.exit(0);
    }
  }

  const progress = !nonInteractive && !IS_JSON ? spinner() : null;
  progress?.start('Extracting archive');
  const result = await restoreArchive(archivePath, targetDir);
  progress?.stop('Restore finished');

  if (!nonInteractive) {
    note(result.targetDir, 'Restored into');
    outro('Restore completed.');
  } else {
    outputResult(`Restore completed into: ${result.targetDir}`, {
      success: true,
      targetDir: result.targetDir,
      archive: archivePath,
    });
  }
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  IS_JSON = args.includes('--json');
  IS_YES = args.includes('--yes') || args.includes('-y');
  const nonInteractive = IS_YES || IS_JSON;

  try {
    if (command === 'init-rule') {
      await handleInitRule({
        name: getFlag(args, '--name'),
        preset: getFlag(args, '--preset'),
        type: getFlag(args, '--type'),
        src: getFlag(args, '--src'),
        dest: getFlag(args, '--dest'),
        nonInteractive:
          nonInteractive || (!!getFlag(args, '--preset') && getFlag(args, '--preset') !== 'other'),
      });
      return;
    }
    if (command === 'backup') {
      await handleBackup(args[0]?.startsWith('-') ? undefined : args[0], nonInteractive);
      return;
    }
    if (command === 'restore') {
      const posArgs = args.filter((a) => !a.startsWith('-'));
      await handleRestore(posArgs[0], posArgs[1], {
        archive: getFlag(args, '--archive'),
        yes: nonInteractive,
      });
      return;
    }
    throw new Error(`Unknown command "${command}".`);
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }
}

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
  claw-backup init-rule [--name <name>]
  claw-backup backup [rule-name-or-path]
  claw-backup restore [rule-name-or-path]
  claw-backup restore <archive.tar.gz> <target-dir>`);
}

function asString(value: unknown): string {
  if (isCancel(value)) {
    cancel('Operation cancelled.');
    process.exit(1);
  }
  return String(value);
}

async function promptForRuleFile(initialPath?: string): Promise<string> {
  if (initialPath) {
    try {
      return await resolveRulePath(initialPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      note(message, 'Error');
      // Fall through to interactive selection
    }
  }
  const ruleFiles = await listRuleFiles();
  if (ruleFiles.length === 0) {
    throw new Error('No rule files found. Run "init-rule" first.');
  }
  const selected = await select({
    message: 'Select a rule file',
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
  initialPath?: string
): Promise<string> {
  if (initialPath) {
    return path.resolve(expandHome(initialPath));
  }
  const ruleName = path.basename(ruleFile, '.yaml');
  const archives = await listArchives(backupDir, ruleName);
  if (archives.length === 0) {
    const input = await text({
      message: 'No archive found in backup_dir. Enter archive path manually',
      placeholder: path.join(backupDir, 'openclaw_202603011800.tar.gz'),
      validate(value) {
        return value.trim() ? undefined : 'Archive path is required.';
      },
    });
    return path.resolve(expandHome(asString(input)));
  }

  const selected = await select({
    message: `Select an archive for ${path.basename(ruleFile)}`,
    options: archives.map((archive) => ({
      value: archive,
      label: path.basename(archive),
      hint: archive,
    })),
  });
  return asString(selected);
}

async function handleInitRule(nameArg?: string): Promise<void> {
  intro('Initialize backup rule');
  const presetChoice = await select({
    message: 'Select claw type',
    options: availablePresetChoices(),
  });
  const selectedPreset = asString(presetChoice);

  // Ask for custom name (optional)
  let customName: string | undefined = nameArg;
  if (!customName) {
    const nameInput = await text({
      message: 'Rule name (optional, press Enter for auto-generated)',
      placeholder: 'my-rule-name',
      validate(value) {
        if (!value.trim()) return undefined; // Allow empty
        if (/[\/\\]/.test(value)) {
          return 'Name cannot contain path separators.';
        }
        return undefined;
      },
    });
    const trimmedName = asString(nameInput).trim();
    if (trimmedName) {
      customName = trimmedName;
    }
  }

  // Check if name already exists
  if (customName) {
    if (await ruleFileExists(customName)) {
      const overwrite = await confirm({
        message: `Rule "${customName}" already exists. Choose a different name?`,
        initialValue: true,
      });
      if (isCancel(overwrite) || overwrite) {
        // Ask for new name
        const newNameInput = await text({
          message: 'Enter a different rule name',
          placeholder: 'my-rule-name-v2',
          validate(value) {
            if (!value.trim()) return 'Name is required.';
            if (/[\/\\]/.test(value)) {
              return 'Name cannot contain path separators.';
            }
            return undefined;
          },
        });
        customName = asString(newNameInput).trim();
        if (await ruleFileExists(customName)) {
          cancel(`Rule "${customName}" also exists. Operation cancelled.`);
          process.exit(1);
        }
      } else {
        cancel('Operation cancelled.');
        process.exit(1);
      }
    }
  }

  if (selectedPreset !== 'other') {
    const created = await createRuleFile({ presetId: selectedPreset, customName });
    note(created.rulePath, 'Rule file');
    note(created.rule.include.join('\n') || '(empty)', 'Include entries');
    outro('Rule initialized.');
    return;
  }

  const clawTypeInput = await text({
    message: 'Custom claw type name',
    placeholder: 'myclaw',
    validate(value) {
      return value.trim() ? undefined : 'Type name is required.';
    },
  });
  const sourceDirInput = await text({
    message: 'Source directory',
    placeholder: '~/.myclaw',
    validate(value) {
      return value.trim() ? undefined : 'Source directory is required.';
    },
  });
  const backupDirInput = await text({
    message: 'Backup output directory',
    placeholder: '~/claw-backups',
    initialValue: '~/claw-backups',
    validate(value) {
      return value.trim() ? undefined : 'Backup directory is required.';
    },
  });

  const created = await createRuleFile({
    presetId: 'other',
    clawType: asString(clawTypeInput),
    sourceDir: asString(sourceDirInput),
    backupDir: asString(backupDirInput),
    customName,
  });
  note(created.rulePath, 'Rule file');
  note(
    'This custom rule starts with an empty include list. Edit the YAML file before running backup.',
    'Manual action required'
  );
  outro('Custom rule initialized.');
}

async function handleBackup(ruleArg?: string): Promise<void> {
  intro('Run claw backup');
  const rulePath = await promptForRuleFile(ruleArg);
  const rule = await loadRule(rulePath);
  await validateRuleSource(rule);

  const proceed = await confirm({
    message: `Run backup from ${rule.sourceDir}?`,
    initialValue: true,
  });
  if (isCancel(proceed) || !proceed) {
    cancel('Backup aborted.');
    process.exit(1);
  }

  const ruleName = path.basename(rulePath, '.yaml');
  const progress = spinner();
  progress.start('Creating tar.gz archive');
  const result = await createBackup(rulePath, rule, ruleName);
  progress.stop(`Archive created with ${result.fileCount} entries`);
  note(result.archivePath, 'Archive path');
  outro('Backup completed.');
}

async function handleRestore(arg1?: string, arg2?: string): Promise<void> {
  // Mode 2: Direct extraction (archive.tar.gz target-dir)
  if (arg1 && arg2) {
    if (!isArchivePath(arg1)) {
      throw new Error(`First argument must be a .tar.gz archive file. Got: ${arg1}`);
    }
    const archivePath = path.resolve(expandHome(arg1));
    const targetDir = path.resolve(expandHome(arg2));

    // Verify archive exists
    const archiveStat = await import('node:fs/promises')
      .then((fs) => fs.stat(archivePath))
      .catch(() => null);
    if (!archiveStat) {
      throw new Error(`Archive not found: ${archivePath}`);
    }

    intro('Direct archive extraction');
    const proceed = await confirm({
      message: `Extract ${path.basename(archivePath)} into ${targetDir}?`,
      initialValue: false,
    });
    if (isCancel(proceed) || !proceed) {
      cancel('Restore aborted.');
      process.exit(1);
    }

    const progress = spinner();
    progress.start('Extracting archive');
    const result = await restoreArchive(archivePath, targetDir);
    progress.stop('Restore finished');
    note(result.archivePath, 'Archive path');
    note(result.targetDir, 'Restored into');
    outro('Restore completed.');
    return;
  }

  // Mode 1: Rule-based restore (0-1 args)
  intro('Restore claw backup');
  const rulePath = await promptForRuleFile(arg1);
  const rule = await loadRule(rulePath);
  const archivePath = await promptForArchive(rulePath, rule.backupDir, undefined);
  const targetDirInput = await text({
    message: 'Restore target directory',
    initialValue: rule.restoreDir,
    validate(value) {
      return value.trim() ? undefined : 'Restore target directory is required.';
    },
  });
  const targetDir = path.resolve(expandHome(asString(targetDirInput)));

  const proceed = await confirm({
    message: `Extract ${path.basename(archivePath)} into ${targetDir}?`,
    initialValue: false,
  });
  if (isCancel(proceed) || !proceed) {
    cancel('Restore aborted.');
    process.exit(1);
  }

  const progress = spinner();
  progress.start('Extracting archive');
  const result = await restoreArchive(archivePath, targetDir);
  progress.stop('Restore finished');
  note(result.archivePath, 'Archive path');
  note(result.targetDir, 'Restored into');
  outro('Restore completed.');
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'init-rule') {
    // Parse --name argument
    let name: string | undefined;
    const nameIndex = args.indexOf('--name');
    if (nameIndex !== -1 && args[nameIndex + 1]) {
      name = args[nameIndex + 1];
    }
    await handleInitRule(name);
    return;
  }
  if (command === 'backup') {
    await handleBackup(args[0]);
    return;
  }
  if (command === 'restore') {
    await handleRestore(args[0], args[1]);
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}

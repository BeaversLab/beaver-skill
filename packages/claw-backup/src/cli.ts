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
import { availablePresetChoices, createRuleFile, listRuleFiles, loadRule, validateRuleSource } from './rules.js';
import { expandHome } from './paths.js';
import { createBackup, listArchives, restoreArchive } from './archive.js';

function usage(): void {
  console.log(`Usage:
  node scripts/cli.ts init-rule
  node scripts/cli.ts backup [rule-file]
  node scripts/cli.ts restore [rule-file] [archive-file]`);
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
    return path.resolve(expandHome(initialPath));
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

async function promptForArchive(ruleFile: string, backupDir: string, initialPath?: string): Promise<string> {
  if (initialPath) {
    return path.resolve(expandHome(initialPath));
  }
  const archives = await listArchives(backupDir);
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

async function handleInitRule(): Promise<void> {
  intro('Initialize backup rule');
  const presetChoice = await select({
    message: 'Select claw type',
    options: availablePresetChoices(),
  });
  const selectedPreset = asString(presetChoice);

  if (selectedPreset !== 'other') {
    const created = await createRuleFile({ presetId: selectedPreset });
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
  });
  note(created.rulePath, 'Rule file');
  note('This custom rule starts with an empty include list. Edit the YAML file before running backup.', 'Manual action required');
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

  const progress = spinner();
  progress.start('Creating tar.gz archive');
  const result = await createBackup(rulePath, rule);
  progress.stop(`Archive created with ${result.fileCount} entries`);
  note(result.archivePath, 'Archive path');
  outro('Backup completed.');
}

async function handleRestore(ruleArg?: string, archiveArg?: string): Promise<void> {
  intro('Restore claw backup');
  const rulePath = await promptForRuleFile(ruleArg);
  const rule = await loadRule(rulePath);
  const archivePath = await promptForArchive(rulePath, rule.backupDir, archiveArg);
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
  const [command, arg1, arg2] = argv;
  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'init-rule') {
    await handleInitRule();
    return;
  }
  if (command === 'backup') {
    await handleBackup(arg1);
    return;
  }
  if (command === 'restore') {
    await handleRestore(arg1, arg2);
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}

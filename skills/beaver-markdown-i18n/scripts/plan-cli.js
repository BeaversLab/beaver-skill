#!/usr/bin/env node
/**
 * i18n-plan — Unified CLI for translation plan management.
 *
 * Subcommands:
 *   init    Initialize a translation session (create run dir, sync, scan)
 *   scan    Scan target files and generate manifest
 *   sync    Detect source file changes (git diff or hash comparison)
 *   add     Add files to the translation plan
 *   status  Show overall translation progress
 *   list    Filter and list files by status/sort/limit
 *   set     Update file status (single or batch)
 *   clean   Clean up temporary files and run directories
 */

import fs from 'fs/promises';
import path from 'path';

import {
  loadPlan, savePlan, findPlanFile, planExists, createEmptyPlan,
  recalcSummary, filterFiles, updateFileStatus, batchUpdateStatus, addFile,
  createRunDir, getRunDir, cleanRunDir, computeFileHash,
  isGitRepo, getCurrentCommit, verifyCommit,
  findMarkdownFiles, syncGitMode, syncHashMode,
} from './lib/plan.js';

import {
  computeTargetRatio, computeFileHash as computeContentHash,
  computeFileHashFromPath, scanTargetDir, buildAndSaveManifest, loadManifest,
} from './lib/scan.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[key] = argv[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, flags };
}

function resolveI18nDir(flags) {
  const projectDir = flags['project-dir'] || process.cwd();
  return path.join(projectDir, '.i18n');
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

async function cmdInit(args) {
  const { positional, flags } = parseArgs(args);
  const sourceDir = positional[0];
  const lang = flags.lang;
  const i18nDir = resolveI18nDir(flags);
  const planPath = flags.output || findPlanFile(flags['project-dir'] || process.cwd());

  if (!sourceDir) {
    console.log('Usage: i18n-plan init <source_dir> [--lang <locale>] [--output <path>]');
    process.exit(1);
  }

  // Create run directory
  const { ts, runDir } = await createRunDir(i18nDir);
  console.log(`Run directory: ${runDir}`);

  // Load or create plan
  let plan;
  if (await planExists(planPath)) {
    plan = await loadPlan(planPath);
    console.log(`Loaded existing plan: ${planPath}`);
  } else {
    plan = createEmptyPlan(sourceDir, lang);
    console.log(`Created new plan`);
  }

  if (sourceDir) plan.meta.source_dir = sourceDir;
  if (lang) plan.meta.lang = lang;
  if (!plan.meta.target_dir && lang) {
    const replaced = sourceDir.replace(/(?:^|\/)[a-z]{2}(-[A-Za-z]+)?\/?$/, (m) => {
      const prefix = m.startsWith('/') ? '/' : '';
      return `${prefix}${lang}/`;
    });
    plan.meta.target_dir = replaced !== sourceDir ? replaced : `${lang}/`;
  }
  plan.meta.current_run = ts;

  await savePlan(plan, planPath);
  console.log(`Plan saved: ${planPath}`);

  // Auto-trigger sync
  console.log(`\n--- Sync ---`);
  await runSync(plan, planPath, i18nDir, flags);

  // Auto-trigger scan
  if (plan.meta.target_dir) {
    console.log(`\n--- Scan ---`);
    await runScan(plan, planPath, i18nDir, flags);
  }

  console.log(`\nInit complete. Run: i18n-plan status`);
}

// ---------------------------------------------------------------------------
// scan
// ---------------------------------------------------------------------------

async function runScan(plan, planPath, i18nDir, flags) {
  const targetDir = plan.meta.target_dir;
  const lang = flags.lang || plan.meta.lang;

  if (!targetDir) {
    console.error('Error: target_dir not set in plan. Specify with init or edit plan.');
    return;
  }
  if (!lang) {
    console.error('Error: lang not set. Use --lang <locale>.');
    return;
  }

  const runDir = getRunDir(plan, i18nDir);
  const manifestPath = runDir
    ? path.join(runDir, 'target-manifest.yaml')
    : path.join(i18nDir, 'target-manifest.yaml');

  console.log(`Scanning target: ${targetDir} (lang: ${lang})`);
  const manifest = await buildAndSaveManifest(targetDir, lang, plan, manifestPath);

  // Update plan entries with fresh target_hash/target_ratio
  for (const scanned of manifest.files) {
    const targetPath = path.join(targetDir, scanned.path);
    const entry = plan.files.find(f => f.target === targetPath);
    if (entry) {
      entry.target_hash = scanned.hash;
      entry.target_ratio = scanned.target_ratio;
    }
  }
  await savePlan(plan, planPath);

  const avgRatio = manifest.files.length > 0
    ? manifest.files.reduce((s, f) => s + f.target_ratio, 0) / manifest.files.length
    : 0;

  console.log(`Scanned ${manifest.files.length} file(s)`);
  console.log(`Average target_ratio: ${(avgRatio * 100).toFixed(1)}%`);
  console.log(`Manifest: ${manifestPath}`);
}

async function cmdScan(args) {
  const { positional, flags } = parseArgs(args);
  const i18nDir = resolveI18nDir(flags);
  const planPath = findPlanFile(flags['project-dir'] || process.cwd());

  if (!(await planExists(planPath))) {
    console.error('Error: No plan found. Run `i18n-plan init` first.');
    process.exit(1);
  }

  const plan = await loadPlan(planPath);
  if (positional[0]) plan.meta.target_dir = positional[0];
  if (flags.lang) plan.meta.lang = flags.lang;

  await runScan(plan, planPath, i18nDir, flags);
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

async function runSync(plan, planPath, i18nDir, flags) {
  const sourceDir = plan.meta.source_dir;
  if (!sourceDir) {
    console.error('Error: source_dir not set in plan.');
    return;
  }

  const mode = flags.mode || 'git';
  const cwd = flags['project-dir'] || process.cwd();

  if (mode === 'git') {
    const inRepo = await isGitRepo(cwd);
    if (!inRepo) {
      console.log('Not a git repository, falling back to hash mode.');
      return runSyncHash(plan, planPath, sourceDir);
    }

    let fromCommit = flags.from || plan.meta.sync_to_commit || '';
    const toCommit = flags.to || await getCurrentCommit(cwd);

    if (!fromCommit) {
      console.log('No previous commit reference, falling back to hash mode.');
      return runSyncHash(plan, planPath, sourceDir);
    }

    if (!(await verifyCommit(fromCommit, cwd))) {
      console.log(`Commit ${fromCommit} not found, falling back to hash mode.`);
      return runSyncHash(plan, planPath, sourceDir);
    }

    console.log(`Git mode: ${fromCommit.slice(0, 12)}..${toCommit.slice(0, 12)}`);
    console.log(`Source: ${sourceDir}`);

    const results = await syncGitMode(plan, sourceDir, fromCommit, toCommit, cwd);
    printSyncResults(results);
  } else {
    await runSyncHash(plan, planPath, sourceDir);
  }

  await savePlan(plan, planPath);
}

async function runSyncHash(plan, planPath, sourceDir) {
  console.log(`Hash mode`);
  console.log(`Source: ${sourceDir}`);

  const results = await syncHashMode(plan, sourceDir);
  printSyncResults(results);
  await savePlan(plan, planPath);
}

function printSyncResults(results) {
  console.log(`\nSync results:`);
  console.log(`  New:       ${results.added}`);
  console.log(`  Modified:  ${results.modified}`);
  console.log(`  Deleted:   ${results.deleted}`);
  const total = results.added + results.modified + results.deleted;
  console.log(`  Actions:   ${total}`);
}

async function cmdSync(args) {
  const { positional, flags } = parseArgs(args);
  const i18nDir = resolveI18nDir(flags);
  const planPath = findPlanFile(flags['project-dir'] || process.cwd());

  if (!(await planExists(planPath))) {
    console.error('Error: No plan found. Run `i18n-plan init` first.');
    process.exit(1);
  }

  const plan = await loadPlan(planPath);
  if (positional[0]) plan.meta.source_dir = positional[0];

  await runSync(plan, planPath, i18nDir, flags);
}

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

async function cmdAdd(args) {
  const { positional, flags } = parseArgs(args);
  const planPath = findPlanFile(flags['project-dir'] || process.cwd());

  if (!(await planExists(planPath))) {
    console.error('Error: No plan found. Run `i18n-plan init` first.');
    process.exit(1);
  }

  const plan = await loadPlan(planPath);
  const sourceDir = plan.meta.source_dir;
  const targetDir = plan.meta.target_dir;
  const status = flags.status || 'pending';

  if (!sourceDir || !targetDir) {
    console.error('Error: source_dir and target_dir must be set in plan.');
    process.exit(1);
  }

  let filesToAdd = [];

  if (flags.match) {
    const allFiles = await findMarkdownFiles(sourceDir, sourceDir);
    const pattern = new RegExp(
      flags.match.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
    );
    filesToAdd = allFiles.filter(f => pattern.test(f.relPath)).map(f => f.relPath);
  } else if (flags.file) {
    const raw = await fs.readFile(flags.file, 'utf-8');
    filesToAdd = raw.split('\n').map(l => l.trim()).filter(Boolean);
  } else if (positional[0]) {
    filesToAdd = [positional[0]];
  } else {
    console.log('Usage: i18n-plan add <source_file> [--status pending]');
    console.log('       i18n-plan add --match "gateway/*.md"');
    console.log('       i18n-plan add --file list.txt');
    process.exit(1);
  }

  let added = 0;
  let skipped = 0;

  for (const relPath of filesToAdd) {
    const sourcePath = path.join(sourceDir, relPath);
    const targetPath = path.join(targetDir, relPath);
    const hash = await computeFileHash(sourcePath);
    const ok = addFile(plan, sourcePath, targetPath, hash, status);
    if (ok) {
      added++;
      console.log(`  + ${relPath}`);
    } else {
      skipped++;
    }
  }

  await savePlan(plan, planPath);
  console.log(`\nAdded: ${added}, Skipped (already in plan): ${skipped}`);
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function cmdStatus(args) {
  const { flags } = parseArgs(args);
  const i18nDir = resolveI18nDir(flags);
  const planPath = findPlanFile(flags['project-dir'] || process.cwd());

  if (!(await planExists(planPath))) {
    console.error('Error: No plan found. Run `i18n-plan init` first.');
    process.exit(1);
  }

  const plan = await loadPlan(planPath);
  recalcSummary(plan);

  if (flags.json) {
    const output = { plan: plan.summary };
    const runDir = getRunDir(plan, i18nDir);
    if (runDir) {
      const manifestPath = path.join(runDir, 'target-manifest.yaml');
      const manifest = await loadManifest(manifestPath);
      if (manifest) output.manifest = manifest;
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const s = plan.summary;
  const srcDir = plan.meta.source_dir || '?';
  const tgtDir = plan.meta.target_dir || '?';
  const pct = s.total > 0 ? ((s.done / s.total) * 100).toFixed(1) : '0.0';

  console.log(`\n翻译计划: ${srcDir} -> ${tgtDir}\n`);
  console.log(`  文件状态:`);
  console.log(`    pending:       ${String(s.pending).padStart(4)} 个文件`);
  console.log(`    in_progress:   ${String(s.in_progress).padStart(4)} 个文件`);
  console.log(`    needs_update:  ${String(s.needs_update).padStart(4)} 个文件`);
  console.log(`    done:          ${String(s.done).padStart(4)} 个文件`);
  console.log(`    deleted:       ${String(s.deleted).padStart(4)} 个文件`);
  console.log(`\n  计划进度: ${s.done}/${s.total} (${pct}%)`);

  // Manifest info
  const runDir = getRunDir(plan, i18nDir);
  if (runDir) {
    const manifestPath = path.join(runDir, 'target-manifest.yaml');
    const manifest = await loadManifest(manifestPath);
    if (manifest && manifest.files?.length > 0) {
      const avgRatio = manifest.files.reduce((sum, f) => sum + f.target_ratio, 0) / manifest.files.length;
      const lowCount = manifest.files.filter(f => f.target_ratio < 0.5).length;
      const scanTime = manifest.scanned_at ? manifest.scanned_at.replace('T', ' ').slice(0, 16) : '?';

      console.log(`\n  目标文件扫描 (target-manifest):`);
      console.log(`    已扫描文件:     ${String(manifest.files.length).padStart(4)} 个`);
      console.log(`    平均翻译完成度: ${(avgRatio * 100).toFixed(1)}%`);
      console.log(`    完成度 < 50%:   ${String(lowCount).padStart(4)} 个文件`);
      console.log(`    上次扫描:       ${scanTime}`);
    }
  }

  console.log(`\n下一步: i18n-plan list --status pending --sort lines\n`);
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function cmdList(args) {
  const { flags } = parseArgs(args);
  const planPath = findPlanFile(flags['project-dir'] || process.cwd());

  if (!(await planExists(planPath))) {
    console.error('Error: No plan found. Run `i18n-plan init` first.');
    process.exit(1);
  }

  const plan = await loadPlan(planPath);
  let files = filterFiles(plan, { status: flags.status, match: flags.match });

  // Sort
  const sort = flags.sort || 'name';
  if (sort === 'lines') {
    const lineCache = new Map();
    for (const f of files) {
      try {
        const content = await fs.readFile(f.source, 'utf-8');
        lineCache.set(f.source, content.split('\n').length);
      } catch {
        lineCache.set(f.source, 0);
      }
    }
    files.sort((a, b) => (lineCache.get(a.source) || 0) - (lineCache.get(b.source) || 0));
  } else {
    files.sort((a, b) => a.source.localeCompare(b.source));
  }

  // Limit
  const limit = flags.limit ? parseInt(flags.limit, 10) : files.length;
  files = files.slice(0, limit);

  if (flags.json) {
    console.log(JSON.stringify(files, null, 2));
    return;
  }

  if (files.length === 0) {
    console.log('No files match the criteria.');
    return;
  }

  console.log(`\n${files.length} file(s):\n`);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let line = `${String(i + 1).padStart(3)}. [${f.status.padEnd(12)}] ${f.source}`;
    if (sort === 'lines') {
      try {
        const content = await fs.readFile(f.source, 'utf-8');
        line += ` (${content.split('\n').length} lines)`;
      } catch { /* ignore */ }
    }
    if (f.target_ratio > 0) {
      line += ` [${(f.target_ratio * 100).toFixed(0)}%]`;
    }
    console.log(line);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// set
// ---------------------------------------------------------------------------

async function cmdSet(args) {
  const { positional, flags } = parseArgs(args);
  const planPath = findPlanFile(flags['project-dir'] || process.cwd());

  if (!(await planExists(planPath))) {
    console.error('Error: No plan found. Run `i18n-plan init` first.');
    process.exit(1);
  }

  const plan = await loadPlan(planPath);

  if (flags.batch) {
    const to = flags.to;
    if (!to) {
      console.error('Error: --batch requires --to <status>');
      process.exit(1);
    }
    const count = batchUpdateStatus(plan, {
      from: flags.from,
      to,
      match: flags.match,
    });

    // If marking done, compute target_hash/target_ratio
    if (to === 'done') {
      await enrichDoneEntries(plan);
    }

    await savePlan(plan, planPath);
    console.log(`Updated ${count} file(s) -> ${to}`);
  } else {
    const filePattern = positional[0];
    const newStatus = positional[1];

    if (!filePattern || !newStatus) {
      console.log('Usage: i18n-plan set <file_pattern> <status> [--notes "..."]');
      console.log('       i18n-plan set --batch --from <status> --to <status> [--match "pattern"]');
      process.exit(1);
    }

    const count = updateFileStatus(plan, filePattern, newStatus, flags.notes);
    if (count === 0) {
      console.error(`File not found in plan: ${filePattern}`);
      process.exit(1);
    }

    // If marking done, compute target_hash/target_ratio for the matched file
    if (newStatus === 'done') {
      await enrichDoneEntries(plan);
    }

    await savePlan(plan, planPath);
    console.log(`Updated: ${filePattern} -> ${newStatus}`);
  }

  const s = plan.summary;
  console.log(`Progress: ${s.done}/${s.total}`);
}

async function enrichDoneEntries(plan) {
  const lang = plan.meta.lang;
  for (const f of plan.files) {
    if (f.status === 'done' && f.target && !f.target_hash) {
      try {
        const content = await fs.readFile(f.target, 'utf-8');
        f.target_hash = computeContentHash(content);
        f.target_ratio = computeTargetRatio(content, lang);
      } catch { /* target doesn't exist yet */ }
    }
  }
}

// ---------------------------------------------------------------------------
// clean
// ---------------------------------------------------------------------------

async function cmdClean(args) {
  const { flags } = parseArgs(args);
  const i18nDir = resolveI18nDir(flags);
  const planPath = findPlanFile(flags['project-dir'] || process.cwd());

  const dryRun = !!flags['dry-run'];
  const all = !!flags.all;
  const keepPlan = !!flags['keep-plan'];

  let plan = null;
  if (await planExists(planPath)) {
    plan = await loadPlan(planPath);
  }

  const toDelete = [];

  if (all) {
    const runsDir = path.join(i18nDir, 'runs');
    toDelete.push(runsDir);
    if (!keepPlan) toDelete.push(planPath);
  } else if (plan?.meta?.current_run) {
    const runDir = getRunDir(plan, i18nDir);
    if (runDir) toDelete.push(runDir);
  } else {
    console.log('No current run to clean. Use --all to clean all runs.');
    return;
  }

  if (dryRun) {
    console.log('Dry run — would delete:');
    for (const p of toDelete) console.log(`  ${p}`);
    return;
  }

  for (const p of toDelete) {
    try {
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        await fs.rm(p, { recursive: true, force: true });
      } else {
        await fs.unlink(p);
      }
      console.log(`Deleted: ${p}`);
    } catch {
      console.log(`Not found: ${p}`);
    }
  }

  if (plan && !all) {
    plan.meta.current_run = '';
    await savePlan(plan, planPath);
  }

  console.log('Clean complete.');
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

const COMMANDS = {
  init: cmdInit,
  scan: cmdScan,
  sync: cmdSync,
  add: cmdAdd,
  status: cmdStatus,
  list: cmdList,
  set: cmdSet,
  clean: cmdClean,
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`i18n-plan — Translation plan management CLI\n`);
    console.log(`Usage: i18n-plan <command> [options]\n`);
    console.log(`Commands:`);
    console.log(`  init    Initialize translation session (create run dir, sync, scan)`);
    console.log(`  scan    Scan target files and generate manifest`);
    console.log(`  sync    Detect source file changes (git/hash mode)`);
    console.log(`  add     Add files to the translation plan`);
    console.log(`  status  Show overall translation progress`);
    console.log(`  list    Filter and list files by status`);
    console.log(`  set     Update file status (single or batch)`);
    console.log(`  clean   Clean up temporary files and run directories`);
    console.log(`\nRun 'i18n-plan <command> --help' for command-specific help.`);
    process.exit(0);
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error(`Run 'i18n-plan --help' for available commands.`);
    process.exit(1);
  }

  await handler(args.slice(1));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

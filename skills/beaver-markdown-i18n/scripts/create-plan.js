#!/usr/bin/env node
/**
 * Create a translation plan for markdown i18n.
 *
 * Usage:
 *   node create-plan.js <source_dir> <target_dir> [--output <plan_file>] [--dry-run]
 *
 * Default output: <cwd>/.i18n/translation-plan.yaml
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

async function findMarkdownFiles(dir, baseDir = dir) {
  const files = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await findMarkdownFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        files.push(path.relative(baseDir, fullPath));
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files.sort();
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createPlan(sourceDir, targetDir, outputPath, dryRun = false) {
  const sourceFiles = await findMarkdownFiles(sourceDir);

  if (sourceFiles.length === 0) {
    console.error(`No .md/.mdx files found in ${sourceDir}`);
    process.exit(1);
  }

  const files = [];
  let completed = 0;

  for (const relPath of sourceFiles) {
    const sourcePath = path.join(sourceDir, relPath);
    const targetPath = path.join(targetDir, relPath);
    const exists = await fileExists(targetPath);

    if (exists) completed++;

    files.push({
      source: sourcePath,
      target: targetPath,
      status: exists ? 'done' : 'pending',
      notes: ''
    });
  }

  const remaining = files.length - completed;
  const status = remaining === 0 ? 'completed' : (completed > 0 ? 'in_progress' : 'not_started');

  const plan = {
    meta: {
      created: new Date().toISOString(),
      source_dir: sourceDir,
      target_dir: targetDir,
      status: status
    },
    summary: {
      total: files.length,
      completed: completed,
      remaining: remaining
    },
    files: files,
    log: []
  };

  const yamlContent = yaml.dump(plan, {
    indent: 2,
    lineWidth: -1,
    noRefs: true
  });

  if (dryRun) {
    console.log(yamlContent);
  } else {
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, yamlContent, 'utf-8');

    console.log(`Plan created: ${outputPath}`);
    console.log(`Total files: ${files.length}`);
    console.log(`Already done: ${completed}`);
    console.log(`Pending: ${remaining}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let sourceDir, targetDir, outputPath = null, dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (!sourceDir) {
      sourceDir = args[i];
    } else if (!targetDir) {
      targetDir = args[i];
    }
  }

  if (!sourceDir || !targetDir) {
    console.log('Usage: node create-plan.js <source_dir> <target_dir> [--output <file>] [--dry-run]');
    console.log('');
    console.log('Arguments:');
    console.log('  source_dir       Source directory containing markdown files');
    console.log('  target_dir       Target directory for translated files');
    console.log('  --output, -o     Custom output path (default: <cwd>/.i18n/translation-plan.yaml)');
    console.log('  --dry-run        Print plan to stdout instead of writing file');
    console.log('');
    console.log('Examples:');
    console.log('  node create-plan.js docs/en docs/zh');
    console.log('  node create-plan.js docs/en docs/zh --output custom/plan.yaml');
    process.exit(1);
  }

  const finalOutputPath = outputPath || path.join(process.cwd(), '.i18n', 'translation-plan.yaml');

  console.log(`  Output path: ${finalOutputPath}`);
  await createPlan(sourceDir, targetDir, finalOutputPath, dryRun);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

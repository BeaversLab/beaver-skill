#!/usr/bin/env node
/**
 * Create a detailed sync plan based on Git diff with operation types.
 *
 * Usage:
 *   node git-diff-sync.js <source_file> <target_file> [options]
 *
 * Default output: <cwd>/.i18n/git-sync-plan.yaml
 *
 * Examples:
 *   node git-diff-sync.js docs/en/guide.md docs/zh/guide.md
 *   node git-diff-sync.js docs/en/guide.md docs/zh/guide.md --ref HEAD~1
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const execFileAsync = promisify(execFile);

/**
 * Execute git command safely using execFile (no shell interpolation)
 */
async function gitExec(args, cwd = process.cwd()) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    throw new Error(`Git command failed: git ${args.join(' ')}\n${error.message}`);
  }
}

async function getCurrentCommit(cwd = process.cwd()) {
  const { stdout } = await gitExec(['rev-parse', 'HEAD'], cwd);
  return stdout;
}

async function resolveGitRef(gitRef, cwd = process.cwd()) {
  const { stdout } = await gitExec(['rev-parse', gitRef], cwd);
  return stdout;
}

async function getGitDiff(filePath, gitRef = 'HEAD', cwd = process.cwd()) {
  const { stdout } = await gitExec(['diff', gitRef, '--', filePath], cwd);
  return stdout;
}

function parseGitDiffDetailed(diffOutput) {
  const lines = diffOutput.split('\n');
  const hunks = [];
  let currentHunk = null;
  let inHunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (currentHunk && inHunk) {
        hunks.push(currentHunk);
      }

      currentHunk = {
        old_start: parseInt(hunkMatch[1], 10),
        old_count: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
        new_start: parseInt(hunkMatch[3], 10),
        new_count: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
        deleted_lines: [],
        added_lines: [],
        context_lines: [],
        header: line
      };
      inHunk = true;
      continue;
    }

    if (inHunk && currentHunk) {
      if (line.startsWith('-')) {
        currentHunk.deleted_lines.push(line.substring(1));
      } else if (line.startsWith('+')) {
        currentHunk.added_lines.push(line.substring(1));
      } else if (line.startsWith(' ')) {
        currentHunk.context_lines.push(line.substring(1));
      } else if (line === '\\ No newline at end of file') {
        continue;
      } else if (line.startsWith('@@') || line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
        if (currentHunk) {
          hunks.push(currentHunk);
          currentHunk = null;
        }
        inHunk = false;
      }
    }
  }

  if (currentHunk && inHunk) {
    hunks.push(currentHunk);
  }

  return hunks.map(hunk => analyzeHunkOperation(hunk));
}

function analyzeHunkOperation(hunk) {
  const hasDeleted = hunk.deleted_lines.length > 0;
  const hasAdded = hunk.added_lines.length > 0;
  const hasOnlyWhitespaceChanges = checkWhitespaceOnlyChanges(hunk);

  let operation = 'modify';
  let description = 'Content modified';

  if (!hasDeleted && hasAdded) {
    operation = 'add';
    description = `Add ${hunk.added_lines.length} line(s)`;
  } else if (hasDeleted && !hasAdded) {
    operation = 'delete';
    description = `Delete ${hunk.deleted_lines.length} line(s)`;
  } else if (hasOnlyWhitespaceChanges) {
    operation = 'format';
    description = 'Format/whitespace change';
  } else if (hasDeleted && hasAdded) {
    operation = 'modify';
    description = `Replace ${hunk.deleted_lines.length} line(s) with ${hunk.added_lines.length} line(s)`;
  }

  return {
    ...hunk,
    operation,
    description,
    line_range: `Lines ${hunk.new_start}-${hunk.new_start + hunk.new_count - 1}`
  };
}

function checkWhitespaceOnlyChanges(hunk) {
  if (hunk.deleted_lines.length !== hunk.added_lines.length) {
    return false;
  }

  for (let i = 0; i < hunk.deleted_lines.length; i++) {
    if (hunk.deleted_lines[i].trim() !== hunk.added_lines[i].trim()) {
      return false;
    }
  }

  return true;
}

async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function parseMarkdownSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let currentSection = { title: '(untitled)', start: 0, level: 0 };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      if (currentSection.start < i) {
        currentSection.end = i - 1;
        currentSection.content = lines.slice(currentSection.start, i).join('\n');
        sections.push({ ...currentSection });
      }

      currentSection = {
        title: headingMatch[2],
        start: i,
        level: headingMatch[1].length
      };
    }
  }

  if (currentSection.start < lines.length) {
    currentSection.end = lines.length - 1;
    currentSection.content = lines.slice(currentSection.start).join('\n');
    sections.push(currentSection);
  }

  return sections;
}

function findAffectedSections(hunks, sections) {
  const affected = new Map();

  for (const hunk of hunks) {
    if (!hunk || typeof hunk.new_start === 'undefined') {
      console.error('Invalid hunk:', hunk);
      continue;
    }

    for (const section of sections) {
      if (hunk.new_start >= section.start && hunk.new_start <= section.end + 1) {
        if (!affected.has(section.title)) {
          affected.set(section.title, []);
        }
        affected.get(section.title).push(hunk);
        break;
      }
    }
  }

  return Array.from(affected.entries()).map(([sectionTitle, sectionHunks]) => {
    const operationTypes = sectionHunks
      .map(h => h.operation || 'unknown')
      .filter((op, index, self) => self.indexOf(op) === index);

    return {
      section_title: sectionTitle,
      hunks: sectionHunks,
      operation_types: operationTypes,
      total_changes: sectionHunks.length
    };
  });
}

function generateExecutionInstructions(plan) {
  const instructions = [
    '1. Review the affected sections and operation types',
    '2. For each section, process changes in order:',
    '   - ADD: Translate new lines and insert at target',
    '   - DELETE: Remove corresponding lines from target',
    '   - MODIFY: Translate changes and update target',
    '   - FORMAT: Adjust formatting (spacing, indentation)',
    '3. Preserve code blocks, URLs, and technical terms',
    '4. Validate structure and links',
    '5. Run validation: node scripts/validate.js source.md target.md'
  ];

  const operationStats = { add: 0, delete: 0, modify: 0, format: 0 };
  plan.changes.forEach(change => {
    operationStats[change.operation]++;
  });

  return {
    steps: instructions,
    operation_summary: operationStats,
    tips: [
      'For ADD operations: Focus on translating new content',
      'For DELETE operations: Ensure target deletion is safe',
      'For MODIFY operations: Compare old and new, translate only deltas',
      'For FORMAT operations: Adjust spacing without changing content'
    ]
  };
}

async function createGitDiffSyncPlan(sourceFile, targetFile, gitRef, outputPath, cwd = process.cwd()) {
  console.log(`Analyzing Git changes...`);
  console.log(`  Source file: ${sourceFile}`);
  console.log(`  Target file: ${targetFile}`);
  console.log(`  Git reference: ${gitRef}`);
  console.log(`  Working directory: ${cwd}`);

  try {
    await gitExec(['rev-parse', '--git-dir'], cwd);
  } catch {
    throw new Error('Not in a Git repository. Please run this command from within a Git repository.');
  }

  console.log(`\nResolving commit hashes...`);
  const sourceCommit = await getCurrentCommit(cwd);
  const targetCommit = await resolveGitRef(gitRef, cwd);
  console.log(`  Source commit: ${sourceCommit}`);
  console.log(`  Target commit: ${targetCommit}`);
  console.log(`  View diff: git diff ${targetCommit} ${sourceCommit} -- ${sourceFile}`);

  console.log(`\nGetting Git diff...`);
  const diffOutput = await getGitDiff(sourceFile, gitRef, cwd);

  if (!diffOutput) {
    console.log(`✓ No changes detected in ${sourceFile} compared to ${gitRef}`);

    const plan = {
      meta: {
        created: new Date().toISOString(),
        source_file: sourceFile,
        target_file: targetFile,
        git_ref: gitRef,
        source_commit: sourceCommit,
        target_commit: targetCommit,
        type: 'git-diff-sync',
        format_version: '2.0',
        status: 'completed'
      },
      summary: { has_changes: false, message: 'No changes detected' },
      changes: [],
      affected_sections: [],
      execution: null
    };

    await writePlan(plan, outputPath);
    return;
  }

  console.log(`  Parsing diff with operation types...`);
  const hunks = parseGitDiffDetailed(diffOutput);
  console.log(`  Found ${hunks.length} change hunk(s)`);

  const newContent = await readFile(sourceFile);
  if (!newContent) {
    throw new Error(`Source file not found: ${sourceFile}`);
  }

  const sections = parseMarkdownSections(newContent);
  const affectedSections = findAffectedSections(hunks, sections);

  console.log(`\n✓ Changes detected in ${affectedSections.length} section(s):`);
  affectedSections.forEach(section => {
    console.log(`  - ${section.section_title} (${section.operation_types.join(', ')})`);
  });

  const targetContent = await readFile(targetFile);
  const targetExists = !!targetContent;

  if (!targetExists) {
    console.log(`\n⚠️  Warning: Target file does not exist: ${targetFile}`);
    console.log(`   Full translation will be needed.`);
  }

  const execution = generateExecutionInstructions({ changes: hunks });

  const plan = {
    meta: {
      created: new Date().toISOString(),
      source_file: sourceFile,
      target_file: targetFile,
      git_ref: gitRef,
      source_commit: sourceCommit,
      target_commit: targetCommit,
      type: 'git-diff-sync',
      format_version: '2.0',
      status: 'pending'
    },
    summary: {
      has_changes: true,
      total_hunks: hunks.length,
      affected_sections: affectedSections.length,
      target_exists: targetExists,
      operations: execution.operation_summary
    },
    changes: hunks.map((hunk, index) => ({
      hunk_index: index,
      operation: hunk.operation,
      description: hunk.description,
      line_range: hunk.line_range,
      old_start: hunk.old_start,
      old_count: hunk.old_count,
      new_start: hunk.new_start,
      new_count: hunk.new_count,
      deleted_lines: hunk.deleted_lines,
      added_lines: hunk.added_lines,
      context_lines: hunk.context_lines,
      header: hunk.header
    })),
    affected_sections: affectedSections.map(section => ({
      section_title: section.section_title,
      operation_types: section.operation_types,
      total_changes: section.total_changes,
      hunks: section.hunks.map(h => ({
        hunk_index: h.hunk_index,
        operation: h.operation,
        description: h.description
      }))
    })),
    execution
  };

  await writePlan(plan, outputPath);
}

async function writePlan(plan, outputPath) {
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  const yamlContent = yaml.dump(plan, { indent: 2, lineWidth: -1, noRefs: true });
  await fs.writeFile(outputPath, yamlContent, 'utf-8');

  console.log(`\n✓ Sync plan created: ${outputPath}`);

  if (plan.summary.has_changes) {
    console.log(`\nOperation Summary:`);
    const ops = plan.summary.operations;
    if (ops.add > 0) console.log(`  ADD: ${ops.add} change(s) - translate and insert`);
    if (ops.delete > 0) console.log(`  DELETE: ${ops.delete} change(s) - remove from target`);
    if (ops.modify > 0) console.log(`  MODIFY: ${ops.modify} change(s) - translate changes`);
    if (ops.format > 0) console.log(`  FORMAT: ${ops.format} change(s) - adjust formatting`);

    console.log(`\nNext steps:`);
    console.log(`  1. Review the plan file for detailed change information`);
    console.log(`  2. Process changes by operation type`);
    if (plan.meta.source_commit && plan.meta.target_commit) {
      console.log(`  3. View diff: git diff ${plan.meta.target_commit} ${plan.meta.source_commit} -- "${plan.meta.source_file}"`);
      console.log(`  4. Validate: node scripts/validate.js "${plan.meta.source_file}" "${plan.meta.target_file}"`);
    }
  } else {
    console.log(`\nNo action needed - file is up to date.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let sourceFile, targetFile, gitRef = 'HEAD', outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[++i];
    } else if (args[i] === '--ref' || args[i] === '-r') {
      gitRef = args[++i];
    } else if (!sourceFile) {
      sourceFile = args[i];
    } else if (!targetFile) {
      targetFile = args[i];
    }
  }

  if (!sourceFile || !targetFile) {
    console.log('Usage: node git-diff-sync.js <source_file> <target_file> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --ref, -r     Git reference to compare with (default: HEAD)');
    console.log('  --output, -o  Custom output path (default: <cwd>/.i18n/git-sync-plan.yaml)');
    console.log('');
    console.log('Operation types: ADD, DELETE, MODIFY, FORMAT');
    console.log('');
    console.log('Examples:');
    console.log('  node git-diff-sync.js docs/en/guide.md docs/zh/guide.md');
    console.log('  node git-diff-sync.js docs/en/guide.md docs/zh/guide.md --ref HEAD~1');
    process.exit(1);
  }

  const finalOutputPath = outputPath || path.join(process.cwd(), '.i18n', 'git-sync-plan.yaml');
  console.log(`  Output path: ${finalOutputPath}\n`);

  await createGitDiffSyncPlan(sourceFile, targetFile, gitRef, finalOutputPath);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

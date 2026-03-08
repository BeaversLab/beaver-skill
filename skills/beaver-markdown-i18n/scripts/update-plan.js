#!/usr/bin/env node
/**
 * Update translation plan status.
 *
 * Usage:
 *   node update-plan.js <plan_file> <source_file> <status> [--notes "note"]
 *
 * Example:
 *   node update-plan.js translation-plan.yaml docs/en/guide.md done
 *   node update-plan.js translation-plan.yaml docs/en/faq.md in_progress --notes "50% complete"
 */

import fs from 'fs/promises';
import yaml from 'js-yaml';

async function updatePlan(planPath, sourceFile, newStatus, notes = null) {
  const content = await fs.readFile(planPath, 'utf-8');
  const plan = yaml.load(content);
  
  // Find and update the file
  let found = false;
  for (const file of plan.files) {
    if (file.source === sourceFile || file.source.endsWith(sourceFile)) {
      file.status = newStatus;
      if (notes !== null) {
        file.notes = notes;
      }
      found = true;
      
      // Add log entry
      plan.log.push({
        time: new Date().toISOString(),
        file: file.source,
        action: newStatus,
        notes: notes || ''
      });
      
      break;
    }
  }
  
  if (!found) {
    console.error(`File not found in plan: ${sourceFile}`);
    process.exit(1);
  }
  
  // Update summary
  const completed = plan.files.filter(f => f.status === 'done').length;
  const remaining = plan.files.length - completed;
  
  plan.summary.completed = completed;
  plan.summary.remaining = remaining;
  plan.meta.status = remaining === 0 ? 'completed' : 'in_progress';
  
  // Write back
  const yamlContent = yaml.dump(plan, {
    indent: 2,
    lineWidth: -1,
    noRefs: true
  });
  
  await fs.writeFile(planPath, yamlContent, 'utf-8');
  console.log(`Updated: ${sourceFile} → ${newStatus}`);
  console.log(`Progress: ${completed}/${plan.files.length} (${remaining} remaining)`);
}

// Parse arguments
const args = process.argv.slice(2);
let planPath, sourceFile, status, notes = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--notes' || args[i] === '-n') {
    notes = args[++i];
  } else if (!planPath) {
    planPath = args[i];
  } else if (!sourceFile) {
    sourceFile = args[i];
  } else if (!status) {
    status = args[i];
  }
}

if (!planPath || !sourceFile || !status) {
  console.log('Usage: node update-plan.js <plan_file> <source_file> <status> [--notes "note"]');
  console.log('');
  console.log('Status values: pending, in_progress, done, skipped');
  console.log('');
  console.log('Example:');
  console.log('  node update-plan.js translation-plan.yaml docs/en/guide.md done');
  process.exit(1);
}

updatePlan(planPath, sourceFile, status, notes);

#!/usr/bin/env node
/**
 * 列出剩余需要翻译的文件
 * 用法: node scripts/list-remaining.js
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

function listRemaining() {
  const __dirname = new URL('.', import.meta.url).pathname;
  const planPath = path.join(__dirname, '../../.i18n/translation-plan.yaml');

  if (!fs.existsSync(planPath)) {
    console.error('错误: 找不到 translation-plan.yaml');
    process.exit(1);
  }

  const data = yaml.load(fs.readFileSync(planPath, 'utf8'));
  const needsUpdate = data.files
    .filter(f => f.status === 'needs_update')
    .map(f => {
      const source = f.source;
      if (fs.existsSync(source)) {
        const content = fs.readFileSync(source, 'utf8');
        const lineCount = content.split('\n').length;
        return { source, lineCount, target: f.target };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.lineCount - b.lineCount);

  console.log(`\n剩余 ${needsUpdate.length} 个文件需要翻译：\n`);
  console.log('按行数从小到大排序：\n');

  needsUpdate.forEach((f, i) => {
    console.log(`${i + 1}. ${f.source}`);
    console.log(`   → ${f.target}`);
    console.log(`   (${f.lineCount} 行)\n`);
  });

  console.log(`\n总计: ${needsUpdate.reduce((sum, f) => sum + f.lineCount, 0)} 行\n`);
}

listRemaining();

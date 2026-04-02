import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';
import process from 'node:process';
import {
  CONFIG_PATH,
  ENV_PATH,
  extractEnvName,
  initConfig,
  loadConfig,
  loadI18n,
  resolveEnvToken,
  saveConfig,
  validateConfig,
} from './config';
import { runDigest } from './digest-core';
import type { FeedSource, OutputLanguage } from './types';

function printUsage(): void {
  console.log(`beaver-rss-digest

Usage:
  digest init [--force] [--interactive]
  digest run [--hours <n>] [--top-n <n>] [--lang <zh|en>] [--output <path>]
  digest config path
  digest config validate
  digest source list
  digest source add [--name <name> --xml <xmlUrl> --html <htmlUrl>]
  digest source remove [--name <name>]
`);
}

function parseNumberArg(args: string[], key: string): number | undefined {
  const idx = args.indexOf(key);
  if (idx < 0 || !args[idx + 1]) return undefined;
  const parsed = Number.parseInt(args[idx + 1]!, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringArg(args: string[], key: string): string | undefined {
  const idx = args.indexOf(key);
  if (idx < 0 || !args[idx + 1]) return undefined;
  return args[idx + 1]!;
}

async function runInteractiveSetup(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    const hours = (await rl.question('默认抓取小时数（默认 48）: ')).trim();
    const topN = (await rl.question('默认精选条数（默认 15）: ')).trim();
    const langRaw = (await rl.question('默认输出语言 zh/en（默认 zh）: ')).trim();
    const outputDir = (await rl.question('默认输出目录（默认 ./output）: ')).trim();
    const cfg = await loadConfig();
    if (hours) cfg.defaults.hours = Number.parseInt(hours, 10) || cfg.defaults.hours;
    if (topN) cfg.defaults.topN = Number.parseInt(topN, 10) || cfg.defaults.topN;
    if (langRaw === 'en' || langRaw === 'zh') cfg.defaults.language = langRaw as OutputLanguage;
    if (outputDir) cfg.defaults.outputDir = outputDir;
    await saveConfig(cfg);
    console.log('[digest] 配置已保存。');
  } finally {
    rl.close();
  }
}

async function ensureConfigReady(): Promise<void> {
  let config;
  try {
    config = await loadConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Missing config file')) {
      console.log('[digest] 配置文件不存在，正在初始化...');
      await initConfig(false);
      console.log('[digest] 已创建默认配置。请编辑后重试：');
      console.log(`  配置文件: ${CONFIG_PATH}`);
      console.log(`  环境变量: ${ENV_PATH}`);
      console.log('\n需要配置的关键项：');
      console.log('  1. 在 .env 中设置 API Key（如 ZHIPU_API_KEY=your-key）');
      console.log('  2. llms[].enabled — 启用至少一个 LLM');
      console.log('  3. rssFeeds — 根据需要增删 RSS 源');
      process.exit(1);
    }
    throw e;
  }

  if (config.version < 2) {
    console.log('[digest] 配置版本过旧，正在升级...');
    await initConfig(true);
    await runInteractiveSetup();
    return;
  }

  const { errors, warnings } = await validateConfig(config);

  if (warnings.length) {
    for (const w of warnings) console.warn(`[digest] ⚠️  ${w}`);
    console.log('');
  }

  if (!errors.length) return;

  const llmErrors = errors.filter(
    (e) => e.toLowerCase().includes('llm') || e.toLowerCase().includes('apikey')
  );
  const otherErrors = errors.filter((e) => !llmErrors.includes(e));

  console.error('[digest] 配置存在问题：');
  for (const err of errors) console.error(`  - ${err}`);
  console.log('');

  if (llmErrors.length) {
    console.log('LLM 相关问题修复建议：');
    console.log('  1. 确保至少一个 llms[] 项的 enabled 为 true');
    console.log('  2. 确保 apiKey 字段格式正确（如 {{ZHIPU_API_KEY}}）');
    console.log(`  3. 在 .env 中设置 API Key 或 export 到环境: ${ENV_PATH}`);
    console.log(`  4. 编辑配置文件: ${CONFIG_PATH}`);
    console.log('');
  }

  if (otherErrors.length && !llmErrors.length) {
    console.log('[digest] 将进入交互配置向导修复 defaults 配置...');
    await runInteractiveSetup();
    return;
  }

  process.exit(1);
}

async function handleRun(args: string[]): Promise<void> {
  await ensureConfigReady();
  const config = await loadConfig();
  const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hours = parseNumberArg(args, '--hours') ?? config.defaults.hours;
  const topN = parseNumberArg(args, '--top-n') ?? config.defaults.topN;
  const langRaw = parseStringArg(args, '--lang');
  const language: OutputLanguage = langRaw === 'en' ? 'en' : config.defaults.language;
  const outputPath =
    parseStringArg(args, '--output') ?? join(config.defaults.outputDir, `digest-${now}.md`);

  const i18n = await loadI18n();
  const enabledLlms = config.llms.filter((l) => l.enabled);
  if (!enabledLlms.length) {
    console.error('[digest] No enabled LLM configured. Edit config: ' + CONFIG_PATH);
    process.exit(1);
  }
  const hasKey = enabledLlms.some((l) => resolveEnvToken(l.apiKey));
  if (!hasKey) {
    console.error('[digest] No LLM API key env var is set. At least one is required to run.');
    console.error(`[digest] Set keys in: ${ENV_PATH}`);
    for (const l of enabledLlms) {
      const envName = extractEnvName(l.apiKey);
      if (envName) console.error(`  ${envName}=your-key  # for ${l.provider}`);
    }
    process.exit(1);
  }
  console.log(
    `[digest] LLM chain: ${enabledLlms.map((l) => `${l.provider}/${l.model}`).join(' → ')}`
  );
  console.log(`[digest] hours=${hours} topN=${topN} lang=${language}`);

  await runDigest({
    feeds: config.rssFeeds,
    prompts: config.prompts,
    hours,
    topN,
    language,
    outputPath,
    llms: config.llms,
    categories: config.categories,
    reportTemplate: config.defaults.reportTemplate,
    i18n: i18n[language],
  });
}

async function handleSourceList(): Promise<void> {
  const config = await loadConfig();
  if (!config.rssFeeds.length) {
    console.log('[digest] No RSS sources configured.');
    return;
  }
  for (const [index, source] of config.rssFeeds.entries()) {
    console.log(`${index + 1}. ${source.name}`);
    console.log(`   xml:  ${source.xmlUrl}`);
    console.log(`   html: ${source.htmlUrl}`);
  }
}

async function handleSourceAdd(args: string[]): Promise<void> {
  const config = await loadConfig();
  const rl = createInterface({ input, output });
  try {
    const name = parseStringArg(args, '--name') || (await rl.question('source name: ')).trim();
    const xmlUrl = parseStringArg(args, '--xml') || (await rl.question('xml url: ')).trim();
    const htmlUrl = parseStringArg(args, '--html') || (await rl.question('html url: ')).trim();
    if (!name || !xmlUrl || !htmlUrl) throw new Error('name/xml/html are required');
    const exists = config.rssFeeds.some((x) => x.name === name || x.xmlUrl === xmlUrl);
    if (exists) throw new Error('source already exists');
    const next: FeedSource = { name, xmlUrl, htmlUrl };
    config.rssFeeds.push(next);
    await saveConfig(config);
    console.log(`[digest] added source: ${name}`);
  } finally {
    rl.close();
  }
}

async function handleSourceRemove(args: string[]): Promise<void> {
  const config = await loadConfig();
  const rl = createInterface({ input, output });
  try {
    const name =
      parseStringArg(args, '--name') || (await rl.question('source name to remove: ')).trim();
    const before = config.rssFeeds.length;
    config.rssFeeds = config.rssFeeds.filter((x) => x.name !== name);
    if (config.rssFeeds.length === before) throw new Error(`source not found: ${name}`);
    await saveConfig(config);
    console.log(`[digest] removed source: ${name}`);
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, subcommand] = args;
  if (!command || command === '--help' || command === '-h') return printUsage();

  if (command === 'init') {
    const force = args.includes('--force');
    const interactive = args.includes('--interactive');
    const result = await initConfig(force);
    console.log(
      result.created
        ? `[digest] Created config: ${result.path}`
        : `[digest] Config exists: ${result.path}`
    );
    console.log(`[digest] Environment file: ${ENV_PATH}`);
    console.log('[digest] Edit .env to set API keys (e.g. ZHIPU_API_KEY=your-key)');
    if (interactive) await runInteractiveSetup();
    return;
  }
  if (command === 'run') return handleRun(args);
  if (command === 'config' && subcommand === 'path') return void console.log(CONFIG_PATH);
  if (command === 'config' && subcommand === 'validate') {
    const config = await loadConfig();
    const { errors, warnings } = await validateConfig(config);
    if (warnings.length) {
      for (const w of warnings) console.warn(`[digest] ⚠️  ${w}`);
      console.warn(`[digest] Set API keys in: ${ENV_PATH}`);
    }
    if (errors.length) {
      console.error(`[digest] Config invalid:\n- ${errors.join('\n- ')}`);
      process.exit(1);
    }
    console.log('[digest] Config is valid.');
    return;
  }
  if (command === 'source' && subcommand === 'list') return handleSourceList();
  if (command === 'source' && subcommand === 'add') return handleSourceAdd(args);
  if (command === 'source' && subcommand === 'remove') return handleSourceRemove(args);
  printUsage();
}

await main().catch((error) => {
  console.error(`[digest] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

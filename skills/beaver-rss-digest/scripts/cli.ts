import process from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runLocalDigestCli } from '@beaverslab/rss-digest/file-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const templatesDir = resolve(__dirname, '..', 'templates');
const repoConfigDir = resolve(__dirname, '..', 'config');
const beaverSkillDir = join(homedir(), '.beaver-skill');
const configDir = join(beaverSkillDir, 'beaver-rss-digest');
const configPath = join(configDir, 'config.yaml');
const i18nPath = join(configDir, 'i18n.yaml');
const defaultLlmApiKeyEnv = 'LLM_API_KEY';

await runLocalDigestCli({
  args: process.argv.slice(2),
  configPath,
  i18nPath,
  repoI18nPath: join(repoConfigDir, 'i18n.yaml'),
  configExamplePath: join(repoConfigDir, 'config.example.yaml'),
  defaultLlmApiKeyEnv,
  templatesDir,
});

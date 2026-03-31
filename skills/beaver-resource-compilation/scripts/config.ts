import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';

export interface Config {
  version: number;
  sources: string[];
  target: string;
}

const home = homedir();
export const CONFIG_DIR = join(home, '.beaver-skill', 'beaver-resource-compilation');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.yaml');

export async function loadConfig(): Promise<Config | null> {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const data = yaml.load(raw) as Record<string, unknown>;
    if (
      data &&
      Array.isArray(data.sources) &&
      data.sources.length > 0 &&
      typeof data.target === 'string'
    ) {
      return {
        version: (data.version as number) ?? 1,
        sources: data.sources as string[],
        target: data.target,
      };
    }
  } catch {
    /* corrupted config */
  }
  return null;
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  const content = yaml.dump(config, { lineWidth: -1 });
  await writeFile(CONFIG_PATH, content, 'utf-8');
}

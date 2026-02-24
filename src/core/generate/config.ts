import fs from 'fs-extra';
import path from 'path';
import TOML from '@iarna/toml';
import { GenerateConfigSchema, type GenerateConfig } from './types.js';
import { GenerateError } from '../../utils/errors.js';

const CONFIG_FILENAME = '.sm-generate.toml';

export async function loadGenerateConfig(projectRoot: string): Promise<GenerateConfig | null> {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);

  if (!(await fs.pathExists(configPath))) {
    return null;
  }

  const raw = await fs.readFile(configPath, 'utf-8');
  let parsed: TOML.JsonMap;
  try {
    parsed = TOML.parse(raw);
  } catch {
    throw new GenerateError(`Invalid TOML syntax in ${CONFIG_FILENAME}`);
  }

  const result = GenerateConfigSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new GenerateError(`Invalid ${CONFIG_FILENAME}:\n${details}`);
  }

  return result.data;
}

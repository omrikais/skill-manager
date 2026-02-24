import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { SM_PACKS_DIR } from '../fs/paths.js';
import { PackNotFoundError, UsageError } from '../utils/errors.js';

const PackSkillRefSchema = z.object({
  slug: z.string(),
  repo: z.string(),
});

export const PackSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  tags: z.array(z.string()).default([]),
  repos: z.array(z.string()),
  skills: z.array(PackSkillRefSchema),
});

export type Pack = z.infer<typeof PackSchema>;
export type PackSkillRef = z.infer<typeof PackSkillRefSchema>;

/**
 * List all available skill packs from the bundled packs directory.
 */
export async function listPacks(): Promise<Pack[]> {
  if (!(await fs.pathExists(SM_PACKS_DIR))) return [];

  const entries = await fs.readdir(SM_PACKS_DIR);
  const packs: Pack[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = await fs.readJson(path.join(SM_PACKS_DIR, entry));
      packs.push(PackSchema.parse(raw));
    } catch {
      // Skip invalid pack files
    }
  }

  return packs.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load a specific pack by name.
 */
export async function loadPack(name: string): Promise<Pack> {
  if (/[\/\\]|^\.\.?$/.test(name)) {
    throw new UsageError(`Invalid pack name: "${name}"`);
  }
  const packPath = path.join(SM_PACKS_DIR, `${name}.json`);
  if (!(await fs.pathExists(packPath))) {
    throw new PackNotFoundError(name);
  }

  const raw = await fs.readJson(packPath);
  return PackSchema.parse(raw);
}

import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { skillMetaFile } from '../fs/paths.js';
import { SkillNotFoundError, SmError } from '../utils/errors.js';

const SourceSchema = z.object({
  type: z.enum(['imported', 'created', 'git', 'adopted']),
  importedFrom: z.string().optional(),
  originalPath: z.string().nullish(),
  repo: z.string().optional(),
});

const DeployAsSchema = z.object({
  cc: z.enum(['skill', 'legacy-command', 'none']).default('none'),
  codex: z.enum(['skill', 'legacy-prompt', 'none']).default('none'),
});

export const MetaSchema = z.object({
  format: z.enum(['skill', 'legacy-command', 'legacy-prompt']).default('skill'),
  originalFormat: z.string().optional(),
  source: SourceSchema,
  tags: z.array(z.string()).default([]),
  deployAs: DeployAsSchema,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastDeployed: z.string().optional(),
  lastUsed: z.string().optional(),
  usageCount: z.number().default(0),
});

export type SkillMeta = z.infer<typeof MetaSchema>;
export type DeployAs = z.infer<typeof DeployAsSchema>;
export type Source = z.infer<typeof SourceSchema>;

export async function readMeta(slug: string): Promise<SkillMeta> {
  const metaPath = skillMetaFile(slug);
  let raw: unknown;
  try {
    raw = await fs.readJson(metaPath);
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SkillNotFoundError(slug);
    }
    throw new SmError(
      `Corrupted metadata for skill "${slug}": ${err instanceof Error ? err.message : err}`,
      'META_CORRUPT',
    );
  }
  try {
    return MetaSchema.parse(raw);
  } catch (err) {
    throw new SmError(
      `Corrupted metadata for skill "${slug}": ${err instanceof Error ? err.message : err}`,
      'META_CORRUPT',
    );
  }
}

export async function writeMeta(slug: string, meta: SkillMeta): Promise<void> {
  const metaPath = skillMetaFile(slug);
  await fs.ensureDir(path.dirname(metaPath));
  await fs.writeJson(metaPath, meta, { spaces: 2 });
}

export async function recordUsage(slug: string): Promise<void> {
  const meta = await readMeta(slug);
  meta.lastUsed = new Date().toISOString();
  meta.usageCount = (meta.usageCount ?? 0) + 1;
  await writeMeta(slug, meta);
}

export function createMeta(opts: {
  source: Source;
  tags?: string[];
  deployAs?: Partial<DeployAs>;
  originalFormat?: string;
}): SkillMeta {
  const now = new Date().toISOString();
  return MetaSchema.parse({
    format: 'skill',
    originalFormat: opts.originalFormat,
    source: opts.source,
    tags: opts.tags ?? [],
    deployAs: {
      cc: opts.deployAs?.cc ?? 'none',
      codex: opts.deployAs?.codex ?? 'none',
    },
    createdAt: now,
    updatedAt: now,
  });
}

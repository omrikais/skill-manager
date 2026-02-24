import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { projectManifestFile } from '../fs/paths.js';
import { ManifestError } from '../utils/errors.js';

const ManifestSkillSchema = z.object({
  name: z.string(),
  tools: z.array(z.enum(['cc', 'codex'])).default(['cc', 'codex']),
  scope: z.enum(['user', 'project']).default('user'),
});

const ManifestProfileSchema = z.object({
  description: z.string().optional(),
  skills: z.array(ManifestSkillSchema).default([]),
});

const ManifestSchema = z.object({
  version: z.number().default(1),
  skills: z.array(ManifestSkillSchema).default([]),
  profiles: z.record(z.string(), ManifestProfileSchema).default({}),
  activeProfile: z.string().optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestSkill = z.infer<typeof ManifestSkillSchema>;
export type ManifestProfile = z.infer<typeof ManifestProfileSchema>;

export async function loadManifest(projectRoot: string): Promise<Manifest> {
  const manifestPath = projectManifestFile(projectRoot);

  if (!(await fs.pathExists(manifestPath))) {
    throw new ManifestError(`No .skills.json found in ${projectRoot}`);
  }

  const raw = await fs.readJson(manifestPath);
  return ManifestSchema.parse(raw);
}

export async function saveManifest(projectRoot: string, manifest: Manifest): Promise<void> {
  const manifestPath = projectManifestFile(projectRoot);
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
}

export function resolveActiveSkills(manifest: Manifest): ManifestSkill[] {
  const skills = [...manifest.skills];

  if (manifest.activeProfile && manifest.profiles[manifest.activeProfile]) {
    const profile = manifest.profiles[manifest.activeProfile];
    for (const pSkill of profile.skills) {
      if (!skills.some((s) => s.name === pSkill.name)) {
        skills.push(pSkill);
      }
    }
  }

  return skills;
}

export function createEmptyManifest(): Manifest {
  return { version: 1, skills: [], profiles: {} };
}

import fs from 'fs-extra';
import { z } from 'zod';
import { SM_PROFILES_DIR, profileFile } from '../fs/paths.js';
import { SmError } from '../utils/errors.js';

const ProfileSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  skills: z.array(z.object({
    name: z.string(),
    tools: z.array(z.enum(['cc', 'codex'])).default(['cc', 'codex']),
  })).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;

export async function loadProfile(name: string): Promise<Profile> {
  const pFile = profileFile(name);
  if (!(await fs.pathExists(pFile))) {
    throw new SmError(`Profile not found: ${name}`, 'PROFILE_NOT_FOUND');
  }
  const raw = await fs.readJson(pFile);
  return ProfileSchema.parse(raw);
}

export async function saveProfile(profile: Profile): Promise<void> {
  await fs.ensureDir(SM_PROFILES_DIR);
  profile.updatedAt = new Date().toISOString();
  await fs.writeJson(profileFile(profile.name), profile, { spaces: 2 });
}

export async function listProfiles(): Promise<Profile[]> {
  await fs.ensureDir(SM_PROFILES_DIR);
  const entries = await fs.readdir(SM_PROFILES_DIR);
  const profiles: Profile[] = [];

  for (const entry of entries) {
    if (entry.endsWith('.json')) {
      const name = entry.replace('.json', '');
      try {
        profiles.push(await loadProfile(name));
      } catch {
        // Skip invalid profiles
      }
    }
  }

  return profiles;
}

export async function deleteProfile(name: string): Promise<void> {
  const pFile = profileFile(name);
  if (await fs.pathExists(pFile)) {
    await fs.remove(pFile);
  }
}

export async function profileExists(name: string): Promise<boolean> {
  return fs.pathExists(profileFile(name));
}

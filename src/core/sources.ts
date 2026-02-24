import fs from 'fs-extra';
import { z } from 'zod';
import { SM_HOME, SM_SOURCES_REGISTRY } from '../fs/paths.js';
import { SourceError } from '../utils/errors.js';

export const SourceEntrySchema = z.object({
  name: z.string(),
  url: z.string(),
  addedAt: z.string(),
  lastSync: z.string().optional(),
  lastError: z.string().optional(),
  skillCount: z.number().default(0),
});

export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export const SourcesRegistrySchema = z.object({
  version: z.number().default(1),
  sources: z.array(SourceEntrySchema).default([]),
});

export type SourcesRegistry = z.infer<typeof SourcesRegistrySchema>;

let cached: SourcesRegistry | null = null;

export async function loadSourcesRegistry(): Promise<SourcesRegistry> {
  if (cached) return cached;

  await fs.ensureDir(SM_HOME);

  if (await fs.pathExists(SM_SOURCES_REGISTRY)) {
    const raw = await fs.readJson(SM_SOURCES_REGISTRY);
    cached = SourcesRegistrySchema.parse(raw);
  } else {
    cached = { version: 1, sources: [] };
  }

  return cached;
}

export async function saveSourcesRegistry(registry: SourcesRegistry): Promise<void> {
  await fs.ensureDir(SM_HOME);
  await fs.writeJson(SM_SOURCES_REGISTRY, registry, { spaces: 2 });
  cached = registry;
}

export function resetSourcesCache(): void {
  cached = null;
}

export async function addSourceEntry(entry: SourceEntry): Promise<void> {
  const registry = await loadSourcesRegistry();
  registry.sources = registry.sources.filter((s) => s.name !== entry.name);
  registry.sources.push(entry);
  await saveSourcesRegistry(registry);
}

export async function removeSourceEntry(name: string): Promise<void> {
  const registry = await loadSourcesRegistry();
  registry.sources = registry.sources.filter((s) => s.name !== name);
  await saveSourcesRegistry(registry);
}

export async function getSourceEntry(name: string): Promise<SourceEntry | null> {
  const registry = await loadSourcesRegistry();
  return registry.sources.find((s) => s.name === name) ?? null;
}

export async function updateSourceEntry(name: string, updates: Partial<SourceEntry>): Promise<void> {
  const registry = await loadSourcesRegistry();
  const idx = registry.sources.findIndex((s) => s.name === name);
  if (idx >= 0) {
    registry.sources[idx] = { ...registry.sources[idx], ...updates };
    await saveSourcesRegistry(registry);
  }
}

export function deriveSourceName(url: string): string {
  const name = url
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .split('/')
    .pop()!;

  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new SourceError(`Cannot derive a safe source name from URL: "${url}"`);
  }

  return name;
}

/**
 * Normalize a source URL for comparison: convert GitHub SSH to HTTPS,
 * strip trailing slashes and .git suffix. This ensures that
 * `git@github.com:user/repo.git`, `https://github.com/user/repo.git`,
 * and `https://github.com/user/repo/` all compare as equal.
 */
export function normalizeSourceUrl(url: string): string {
  let normalized = url;
  // Convert GitHub SSH → HTTPS so shorthand (user/repo) matches SSH sources
  const sshMatch = normalized.match(/^git@github\.com:(.+)$/);
  if (sshMatch) {
    normalized = `https://github.com/${sshMatch[1]}`;
  }
  return normalized.replace(/\/+$/, '').replace(/\.git$/, '');
}

export function validateSourceUrl(url: string): void {
  if (!url) {
    throw new SourceError('Source URL cannot be empty');
  }
  if (!url.startsWith('https://') && !url.startsWith('git@')) {
    throw new SourceError(`Invalid source URL: "${url}". Must start with https:// or git@`);
  }
}

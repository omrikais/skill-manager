import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { skillFile, skillHistoryFile } from '../fs/paths.js';
import { hashContent } from './hash.js';
import { SkillNotFoundError } from '../utils/errors.js';

const VersionEntrySchema = z.object({
  version: z.number(),
  hash: z.string(),
  timestamp: z.string(),
  content: z.string(),
  message: z.string().optional(),
});

const VersionHistorySchema = z.object({
  slug: z.string(),
  current: z.number(),
  entries: z.array(VersionEntrySchema).default([]),
});

export type VersionEntry = z.infer<typeof VersionEntrySchema>;
export type VersionHistory = z.infer<typeof VersionHistorySchema>;

export async function loadHistory(slug: string): Promise<VersionHistory> {
  const histPath = skillHistoryFile(slug);
  let raw: unknown;
  try {
    raw = await fs.readJson(histPath);
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { slug, current: 0, entries: [] };
    }
    throw err;
  }
  return VersionHistorySchema.parse(raw);
}

export async function saveHistory(slug: string, history: VersionHistory): Promise<void> {
  const histPath = skillHistoryFile(slug);
  await fs.ensureDir(path.dirname(histPath));
  await fs.writeJson(histPath, history, { spaces: 2 });
}

export async function recordVersion(slug: string, message?: string): Promise<VersionEntry | null> {
  const mdPath = skillFile(slug);
  if (!(await fs.pathExists(mdPath))) {
    throw new SkillNotFoundError(slug);
  }

  const content = await fs.readFile(mdPath, 'utf-8');
  const hash = hashContent(content);
  const history = await loadHistory(slug);

  // Skip if hash matches latest entry
  if (history.entries.length > 0) {
    const latest = history.entries[history.entries.length - 1];
    if (latest.hash === hash) {
      return null;
    }
  }

  const version = history.current + 1;
  const entry: VersionEntry = {
    version,
    hash,
    timestamp: new Date().toISOString(),
    content,
    message,
  };

  history.entries.push(entry);
  history.current = version;
  await saveHistory(slug, history);

  return entry;
}

export async function rollbackToVersion(slug: string, version?: number): Promise<VersionEntry> {
  const history = await loadHistory(slug);

  if (history.entries.length === 0) {
    throw new Error(`No version history for skill "${slug}"`);
  }

  // Default to previous version (current - 1)
  const targetVersion = version ?? history.current - 1;
  if (targetVersion < 1) {
    throw new Error(`No previous version to rollback to for skill "${slug}"`);
  }

  const target = history.entries.find((e) => e.version === targetVersion);
  if (!target) {
    throw new Error(`Version ${targetVersion} not found for skill "${slug}"`);
  }

  // Restore SKILL.md content
  const mdPath = skillFile(slug);
  await fs.writeFile(mdPath, target.content, 'utf-8');

  // Record a new forward entry for the rollback
  const newVersion = history.current + 1;
  const entry: VersionEntry = {
    version: newVersion,
    hash: target.hash,
    timestamp: new Date().toISOString(),
    content: target.content,
    message: `rollback to v${targetVersion}`,
  };

  history.entries.push(entry);
  history.current = newVersion;
  await saveHistory(slug, history);

  return entry;
}

export async function hasContentChanged(slug: string): Promise<boolean> {
  const mdPath = skillFile(slug);
  if (!(await fs.pathExists(mdPath))) return false;

  const content = await fs.readFile(mdPath, 'utf-8');
  const hash = hashContent(content);
  const history = await loadHistory(slug);

  if (history.entries.length === 0) return true;

  const latest = history.entries[history.entries.length - 1];
  return latest.hash !== hash;
}

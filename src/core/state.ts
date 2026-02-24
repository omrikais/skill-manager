import fs from 'fs-extra';
import { z } from 'zod';
import { SM_STATE_FILE, SM_HOME, resolveProjectRoot } from '../fs/paths.js';
import { SmError } from '../utils/errors.js';

const LinkRecordSchema = z.object({
  slug: z.string(),
  tool: z.enum(['cc', 'codex']),
  format: z.enum(['skill', 'legacy-command', 'legacy-prompt']),
  linkPath: z.string(),
  targetPath: z.string(),
  createdAt: z.string(),
  scope: z.enum(['user', 'project']).optional(),
  projectRoot: z.string().optional(),
});

export type LinkRecord = z.infer<typeof LinkRecordSchema>;

const StateSchema = z.object({
  version: z.number().default(1),
  links: z.array(LinkRecordSchema).default([]),
  lastSync: z.string().optional(),
  lastImport: z.string().optional(),
  lastAdoptScan: z.string().optional(),
});

export type State = z.infer<typeof StateSchema>;

let cachedState: State | null = null;

export async function loadState(): Promise<State> {
  if (cachedState) return cachedState;

  await fs.ensureDir(SM_HOME);

  if (await fs.pathExists(SM_STATE_FILE)) {
    let raw: unknown;
    try {
      raw = await fs.readJson(SM_STATE_FILE);
    } catch {
      throw new SmError('State file is corrupted — delete ~/.skill-manager/state.json and re-import', 'STATE_CORRUPT');
    }
    try {
      cachedState = StateSchema.parse(raw);
    } catch {
      throw new SmError('State file has invalid format — delete ~/.skill-manager/state.json and re-import', 'STATE_INVALID');
    }
  } else {
    cachedState = { version: 1, links: [] };
  }

  return cachedState;
}

export async function saveState(state: State): Promise<void> {
  await fs.ensureDir(SM_HOME);
  await fs.writeJson(SM_STATE_FILE, state, { spaces: 2 });
  cachedState = state;
}

export function resetStateCache(): void {
  cachedState = null;
}

export async function addLinkRecord(record: LinkRecord): Promise<void> {
  const state = await loadState();
  const recordScope = record.scope ?? 'user';
  state.links = state.links.filter(
    (l) => !((l.scope ?? 'user') === recordScope
             && l.slug === record.slug
             && l.tool === record.tool
             && l.projectRoot === record.projectRoot)
  );
  state.links.push(record);
  await saveState(state);
}

export async function removeLinkRecord(
  slug: string,
  tool: 'cc' | 'codex',
  scope: 'user' | 'project' = 'user',
  projectRoot?: string,
): Promise<void> {
  const canonical = projectRoot ? resolveProjectRoot(projectRoot) : undefined;
  const state = await loadState();
  state.links = state.links.filter(
    (l) => !((l.scope ?? 'user') === scope
             && l.slug === slug
             && l.tool === tool
             && l.projectRoot === canonical)
  );
  await saveState(state);
}

export async function getLinkRecords(
  slug?: string,
  opts?: { scope?: 'user' | 'project'; projectRoot?: string },
): Promise<LinkRecord[]> {
  const state = await loadState();
  let links = state.links;
  if (slug) links = links.filter((l) => l.slug === slug);
  if (opts?.scope) links = links.filter((l) => (l.scope ?? 'user') === opts.scope);
  if (opts?.projectRoot) {
    const canonical = resolveProjectRoot(opts.projectRoot);
    links = links.filter((l) => l.projectRoot === canonical);
  }
  return links;
}

export async function updateLastSync(): Promise<void> {
  const state = await loadState();
  state.lastSync = new Date().toISOString();
  await saveState(state);
}

export async function updateLastImport(): Promise<void> {
  const state = await loadState();
  state.lastImport = new Date().toISOString();
  await saveState(state);
}

export async function updateLastAdoptScan(): Promise<void> {
  const state = await loadState();
  state.lastAdoptScan = new Date().toISOString();
  await saveState(state);
}

export async function getLastAdoptScan(): Promise<string | undefined> {
  const state = await loadState();
  return state.lastAdoptScan;
}

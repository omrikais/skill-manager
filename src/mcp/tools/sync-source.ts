import { z } from 'zod';
import {
  loadSourcesRegistry,
  getSourceEntry,
  updateSourceEntry,
} from '../../core/sources.js';
import { cloneOrPull } from '../../sources/git.js';
import { scanSourceRepo } from '../../sources/scanner.js';
import { SourceNotFoundError } from '../../utils/errors.js';
import { withToolHandler } from './helpers.js';

export const syncSourceSchema = z.object({
  name: z.string().optional().describe('Source name to sync (omit to sync all)'),
});

export const syncSourceHandler = withToolHandler(
  async (args: z.infer<typeof syncSourceSchema>) => {
    if (args.name) {
      const entry = await getSourceEntry(args.name);
      if (!entry) throw new SourceNotFoundError(args.name);
    }

    const registry = await loadSourcesRegistry();
    const sources = args.name
      ? registry.sources.filter((s) => s.name === args.name)
      : registry.sources;

    const results: Array<{
      name: string;
      success: boolean;
      skillCount?: number;
      error?: string;
    }> = [];

    for (const entry of sources) {
      try {
        const dir = await cloneOrPull(entry.url);
        const skills = await scanSourceRepo(dir, entry.name, entry.url);
        await updateSourceEntry(entry.name, {
          lastSync: new Date().toISOString(),
          skillCount: skills.length,
          lastError: undefined,
        });
        results.push({ name: entry.name, success: true, skillCount: skills.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateSourceEntry(entry.name, { lastError: message });
        results.push({ name: entry.name, success: false, error: message });
      }
    }

    return { synced: results.length, results };
  },
);

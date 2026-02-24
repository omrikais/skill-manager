import { z } from 'zod';
import { loadSourcesRegistry, getSourceEntry } from '../../core/sources.js';
import { SourceNotFoundError } from '../../utils/errors.js';
import { withToolHandler } from './helpers.js';

export const listSourcesSchema = z.object({
  name: z.string().optional().describe('Filter to a specific source by name'),
});

export const listSourcesHandler = withToolHandler(
  async (args: z.infer<typeof listSourcesSchema>) => {
    if (args.name) {
      const entry = await getSourceEntry(args.name);
      if (!entry) throw new SourceNotFoundError(args.name);
      return [
        {
          ...entry,
          status: entry.lastError ? 'error' : 'ok',
        },
      ];
    }

    const registry = await loadSourcesRegistry();
    return registry.sources.map((s) => ({
      ...s,
      status: s.lastError ? 'error' : 'ok',
    }));
  },
);

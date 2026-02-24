import { SmError } from '../../utils/errors.js';
import { resetStateCache } from '../../core/state.js';
import { resetSourcesCache } from '../../core/sources.js';

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function success(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function error(err: unknown): ToolResult {
  let message: string;

  if (err instanceof SmError) {
    message = `Error [${err.code}]: ${err.message}`;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }

  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export function withToolHandler<T extends Record<string, unknown>>(
  fn: (args: T) => Promise<unknown>,
): (args: T) => Promise<ToolResult> {
  return async (args: T) => {
    // Reset caches so each MCP call reflects the current filesystem state.
    // The MCP server is long-lived; without this, external sm CLI operations
    // (e.g. sm add/remove in a terminal) would leave stale in-memory data.
    resetStateCache();
    resetSourcesCache();

    // Auto-adopt unmanaged skills (silent — MCP uses stdio for protocol)
    // Note: no projectRoot — the MCP server is long-lived and process.cwd()
    // doesn't represent the user's active project. User-level dirs are scanned.
    try {
      const { autoAdopt } = await import('../../core/adopt.js');
      await autoAdopt({ silent: true });
    } catch {
      // Non-critical
    }

    try {
      const result = await fn(args);
      return success(result);
    } catch (err) {
      return error(err);
    }
  };
}

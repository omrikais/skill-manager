import { UsageError } from '../utils/errors.js';

// --- Types ---

export type InstallTarget =
  | { type: 'manifest' }
  | { type: 'source'; url: string; slugs: string[] };

// --- Predicates ---

/**
 * Matches `user/repo` GitHub shorthand.
 * Rejects: @scope/pkg, URLs, multi-slash paths.
 */
export function isGitHubShorthand(arg: string): boolean {
  if (arg.startsWith('@')) return false;
  if (arg.includes('://') || arg.startsWith('git@')) return false;
  const parts = arg.split('/');
  if (parts.length !== 2) return false;
  const valid = /^[a-zA-Z0-9._-]+$/;
  return parts[0].length > 0 && parts[1].length > 0 && valid.test(parts[0]) && valid.test(parts[1]);
}

export function expandGitHubShorthand(ref: string): string {
  const normalized = ref.replace(/\.git$/, '');
  return `https://github.com/${normalized}.git`;
}

export function isSourceUrl(arg: string): boolean {
  return arg.startsWith('https://') || arg.startsWith('git@');
}

// --- External command parsing ---

const RUNNERS = new Set(['npx', 'bunx', 'pnpx']);
const COMPOUND_RUNNERS = new Set(['yarn dlx', 'npm exec', 'pnpm dlx']);
const VERBS = new Set(['add', 'install', 'i', 'get']);

/**
 * Parse an external install command (e.g., `npx skillfish add user/repo skill-name`)
 * into a repo reference and optional skill slugs.
 */
export function parseExternalCommand(args: string[]): { repo: string; slugs: string[] } {
  const tokens = [...args];
  let cursor = 0;

  // Strip runner: single-word (npx/bunx/pnpx) or compound (yarn dlx / npm exec / pnpm dlx)
  if (tokens.length >= 2) {
    const compound = `${tokens[0]} ${tokens[1]}`;
    if (COMPOUND_RUNNERS.has(compound)) {
      cursor = 2;
    } else if (RUNNERS.has(tokens[0])) {
      cursor = 1;
    }
  } else if (tokens.length === 1 && RUNNERS.has(tokens[0])) {
    cursor = 1;
  }

  // Strip package name (next token — handles @scope/pkg)
  if (cursor < tokens.length) {
    const pkg = tokens[cursor];
    if (pkg.startsWith('@') && !pkg.includes('/')) {
      // Bare @scope with separate /pkg? Unlikely, but skip both
      cursor += 2;
    } else {
      // @scope/pkg or plain package name
      cursor += 1;
    }
  }

  // Strip command verb
  if (cursor < tokens.length && VERBS.has(tokens[cursor])) {
    cursor += 1;
  }

  // Remaining tokens: filter out flags and their URL-like values.
  // Flags with `=` (--key=val) are self-contained. For `--key val` style,
  // skip the next token only if it looks like a URL — this prevents
  // flag values like `--registry https://...` from being mistaken for the repo.
  // We do NOT skip shorthand-like values (user/repo) since those are more
  // likely positional args after boolean flags like `--force user/repo`.
  const remaining: string[] = [];
  const rest = tokens.slice(cursor);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('-')) {
      if (!rest[i].includes('=') && i + 1 < rest.length && isSourceUrl(rest[i + 1])) {
        i++; // skip URL value of flag
      }
      continue;
    }
    remaining.push(rest[i]);
  }

  if (remaining.length === 0) {
    throw new UsageError(
      'Could not find a repository reference in the command. ' +
      'Expected a GitHub shorthand (user/repo) or URL.',
    );
  }

  // Find the repo reference (first GitHub shorthand or URL)
  const repoIndex = remaining.findIndex((t) => isGitHubShorthand(t) || isSourceUrl(t));
  if (repoIndex === -1) {
    throw new UsageError(
      'Could not find a repository reference in the command. ' +
      'Expected a GitHub shorthand (user/repo) or URL.',
    );
  }

  const repoRef = remaining[repoIndex];
  const repo = isGitHubShorthand(repoRef) ? expandGitHubShorthand(repoRef) : repoRef;
  const slugs = remaining.slice(repoIndex + 1);

  return { repo, slugs };
}

// --- Main resolver ---

/**
 * Classify CLI args into an install target.
 *
 * - No args → manifest mode
 * - URL → source with optional slug filter
 * - GitHub shorthand → expand to URL, source with optional slugs
 * - Package runner (npx/bunx/yarn dlx/...) → parse external command
 * - Otherwise → error
 */
export function resolveInstallTarget(args: string[]): InstallTarget {
  if (args.length === 0) {
    return { type: 'manifest' };
  }

  const first = args[0];

  if (isSourceUrl(first)) {
    return { type: 'source', url: first, slugs: args.slice(1) };
  }

  if (isGitHubShorthand(first)) {
    return { type: 'source', url: expandGitHubShorthand(first), slugs: args.slice(1) };
  }

  // Check for package runner prefix
  if (RUNNERS.has(first)) {
    const { repo, slugs } = parseExternalCommand(args);
    return { type: 'source', url: repo, slugs };
  }

  // Check for compound runner (yarn dlx, npm exec, pnpm dlx)
  if (args.length >= 2) {
    const compound = `${first} ${args[1]}`;
    if (COMPOUND_RUNNERS.has(compound)) {
      const { repo, slugs } = parseExternalCommand(args);
      return { type: 'source', url: repo, slugs };
    }
  }

  throw new UsageError(
    `Unrecognized install argument: "${first}". ` +
    'Use a GitHub shorthand (user/repo), a git URL (https://...), ' +
    'or paste an install command (npx ...).',
  );
}

// --- TUI helper ---

/**
 * Single-string parser for TUI input. Splits on whitespace and delegates to resolveInstallTarget.
 * Always returns a source URL + slugs (never manifest).
 */
export function resolveInstallInput(raw: string): { url: string; slugs: string[] } {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new UsageError('Input cannot be empty');
  }

  const target = resolveInstallTarget(tokens);
  if (target.type === 'manifest') {
    throw new UsageError('A source URL or GitHub shorthand is required');
  }

  return { url: target.url, slugs: target.slugs };
}

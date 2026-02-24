import { describe, it, expect } from 'vitest';
import {
  isGitHubShorthand,
  expandGitHubShorthand,
  isSourceUrl,
  parseExternalCommand,
  resolveInstallTarget,
  resolveInstallInput,
} from '../../src/core/install-resolver.js';
import { UsageError } from '../../src/utils/errors.js';

describe('isGitHubShorthand', () => {
  it('accepts user/repo', () => {
    expect(isGitHubShorthand('user/repo')).toBe(true);
  });

  it('accepts user with dots, hyphens, underscores', () => {
    expect(isGitHubShorthand('my-org_1/my.repo')).toBe(true);
  });

  it('rejects @scope/pkg', () => {
    expect(isGitHubShorthand('@scope/package')).toBe(false);
  });

  it('rejects https URL', () => {
    expect(isGitHubShorthand('https://github.com/user/repo')).toBe(false);
  });

  it('rejects git@ SSH URL', () => {
    expect(isGitHubShorthand('git@github.com:user/repo')).toBe(false);
  });

  it('rejects multi-slash path', () => {
    expect(isGitHubShorthand('a/b/c')).toBe(false);
  });

  it('rejects single segment', () => {
    expect(isGitHubShorthand('foo')).toBe(false);
  });

  it('rejects empty parts', () => {
    expect(isGitHubShorthand('/repo')).toBe(false);
    expect(isGitHubShorthand('user/')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isGitHubShorthand('us er/repo')).toBe(false);
  });
});

describe('expandGitHubShorthand', () => {
  it('produces https github URL with .git', () => {
    expect(expandGitHubShorthand('user/repo')).toBe('https://github.com/user/repo.git');
  });

  it('preserves exact owner and repo', () => {
    expect(expandGitHubShorthand('my-org/my-skills')).toBe('https://github.com/my-org/my-skills.git');
  });

  it('strips trailing .git to avoid .git.git', () => {
    expect(expandGitHubShorthand('user/repo.git')).toBe('https://github.com/user/repo.git');
  });
});

describe('isSourceUrl', () => {
  it('accepts https URL', () => {
    expect(isSourceUrl('https://github.com/user/repo.git')).toBe(true);
  });

  it('accepts git@ SSH URL', () => {
    expect(isSourceUrl('git@github.com:user/repo.git')).toBe(true);
  });

  it('rejects http URL', () => {
    expect(isSourceUrl('http://github.com/user/repo.git')).toBe(false);
  });

  it('rejects plain words', () => {
    expect(isSourceUrl('user/repo')).toBe(false);
  });
});

describe('parseExternalCommand', () => {
  it('parses npx with shorthand and slugs', () => {
    const result = parseExternalCommand(['npx', 'skillfish', 'add', 'user/repo', 'my-skill']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['my-skill']);
  });

  it('parses bunx variant', () => {
    const result = parseExternalCommand(['bunx', 'toolpkg', 'install', 'user/repo', 'a', 'b']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['a', 'b']);
  });

  it('parses pnpx variant', () => {
    const result = parseExternalCommand(['pnpx', 'toolpkg', 'add', 'user/repo']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual([]);
  });

  it('parses yarn dlx (compound runner)', () => {
    const result = parseExternalCommand(['yarn', 'dlx', 'toolpkg', 'add', 'user/repo', 'skill-a']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['skill-a']);
  });

  it('parses npm exec (compound runner)', () => {
    const result = parseExternalCommand(['npm', 'exec', 'toolpkg', 'add', 'user/repo']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual([]);
  });

  it('parses pnpm dlx (compound runner)', () => {
    const result = parseExternalCommand(['pnpm', 'dlx', 'toolpkg', 'get', 'user/repo', 's1']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['s1']);
  });

  it('handles scoped package name (@scope/pkg)', () => {
    const result = parseExternalCommand(['npx', '@cool/tool', 'add', 'user/repo', 'my-skill']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['my-skill']);
  });

  it('strips flags', () => {
    const result = parseExternalCommand(['npx', 'tool', 'add', '-f', '--force', 'user/repo', 'my-skill']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['my-skill']);
  });

  it('skips flag URL values (--registry https://...)', () => {
    const result = parseExternalCommand(['npx', 'tool', 'add', '--registry', 'https://registry.example', 'user/repo']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual([]);
  });

  it('does not skip shorthand after boolean flag', () => {
    const result = parseExternalCommand(['npx', 'tool', 'add', '--force', 'user/repo', 'my-skill']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['my-skill']);
  });

  it('handles --key=value flags without consuming next token', () => {
    const result = parseExternalCommand(['npx', 'tool', 'add', '--registry=https://registry.example', 'user/repo']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual([]);
  });

  it('handles full URL in command', () => {
    const result = parseExternalCommand(['npx', 'tool', 'add', 'https://github.com/user/repo.git', 'my-skill']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['my-skill']);
  });

  it('works without a verb (no add/install)', () => {
    const result = parseExternalCommand(['npx', 'tool', 'user/repo', 'my-skill']);
    expect(result.repo).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['my-skill']);
  });

  it('throws when no repo found', () => {
    expect(() => parseExternalCommand(['npx', 'tool', 'add'])).toThrow(UsageError);
  });

  it('throws for empty args', () => {
    expect(() => parseExternalCommand([])).toThrow(UsageError);
  });
});

describe('resolveInstallTarget', () => {
  it('returns manifest when no args', () => {
    expect(resolveInstallTarget([])).toEqual({ type: 'manifest' });
  });

  it('resolves full URL with no slugs', () => {
    const result = resolveInstallTarget(['https://github.com/user/repo.git']);
    expect(result).toEqual({ type: 'source', url: 'https://github.com/user/repo.git', slugs: [] });
  });

  it('resolves full URL with slugs', () => {
    const result = resolveInstallTarget(['https://github.com/user/repo.git', 'skill-a', 'skill-b']);
    expect(result).toEqual({
      type: 'source',
      url: 'https://github.com/user/repo.git',
      slugs: ['skill-a', 'skill-b'],
    });
  });

  it('resolves git@ SSH URL', () => {
    const result = resolveInstallTarget(['git@github.com:user/repo.git']);
    expect(result).toEqual({ type: 'source', url: 'git@github.com:user/repo.git', slugs: [] });
  });

  it('resolves GitHub shorthand', () => {
    const result = resolveInstallTarget(['user/repo']);
    expect(result).toEqual({ type: 'source', url: 'https://github.com/user/repo.git', slugs: [] });
  });

  it('resolves GitHub shorthand with slugs', () => {
    const result = resolveInstallTarget(['user/repo', 'my-skill', 'other']);
    expect(result).toEqual({
      type: 'source',
      url: 'https://github.com/user/repo.git',
      slugs: ['my-skill', 'other'],
    });
  });

  it('resolves npx external command', () => {
    const result = resolveInstallTarget(['npx', 'skillfish', 'add', 'user/repo', 'my-skill']);
    expect(result).toEqual({
      type: 'source',
      url: 'https://github.com/user/repo.git',
      slugs: ['my-skill'],
    });
  });

  it('resolves yarn dlx external command', () => {
    const result = resolveInstallTarget(['yarn', 'dlx', 'tool', 'add', 'user/repo']);
    expect(result).toEqual({
      type: 'source',
      url: 'https://github.com/user/repo.git',
      slugs: [],
    });
  });

  it('throws for unrecognized arg', () => {
    expect(() => resolveInstallTarget(['foobar'])).toThrow(UsageError);
  });
});

describe('resolveInstallInput', () => {
  it('parses full URL string', () => {
    const result = resolveInstallInput('https://github.com/user/repo.git');
    expect(result.url).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual([]);
  });

  it('parses shorthand string with slugs', () => {
    const result = resolveInstallInput('user/repo my-skill');
    expect(result.url).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['my-skill']);
  });

  it('parses external command string', () => {
    const result = resolveInstallInput('npx skillfish add user/repo render-output');
    expect(result.url).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['render-output']);
  });

  it('trims whitespace', () => {
    const result = resolveInstallInput('  user/repo  skill-a  ');
    expect(result.url).toBe('https://github.com/user/repo.git');
    expect(result.slugs).toEqual(['skill-a']);
  });

  it('throws on empty input', () => {
    expect(() => resolveInstallInput('')).toThrow(UsageError);
    expect(() => resolveInstallInput('   ')).toThrow(UsageError);
  });
});

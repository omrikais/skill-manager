import { describe, it, expect } from 'vitest';
import {
  deriveSourceName,
  validateSourceUrl,
  normalizeSourceUrl,
  SourceEntrySchema,
  SourcesRegistrySchema,
} from '../../src/core/sources.js';
import { SourceError } from '../../src/utils/errors.js';

describe('deriveSourceName', () => {
  it('extracts name from https URL with .git suffix', () => {
    expect(deriveSourceName('https://github.com/user/skills.git')).toBe('skills');
  });

  it('extracts name from https URL without .git suffix', () => {
    expect(deriveSourceName('https://github.com/user/skills')).toBe('skills');
  });

  it('extracts name from git@ SSH URL', () => {
    expect(deriveSourceName('git@github.com:user/my-skills.git')).toBe('my-skills');
  });

  it('handles deeply nested paths', () => {
    expect(deriveSourceName('https://gitlab.com/org/group/subgroup/repo.git')).toBe('repo');
  });

  it('handles trailing slash', () => {
    expect(deriveSourceName('https://github.com/user/skills/')).toBe('skills');
  });

  it('handles trailing slash with .git suffix', () => {
    expect(deriveSourceName('https://github.com/user/skills.git/')).toBe('skills');
  });

  it('handles multiple trailing slashes', () => {
    expect(deriveSourceName('https://github.com/user/skills///')).toBe('skills');
  });

  it('rejects URL that resolves to ".."', () => {
    expect(() => deriveSourceName('https://evil.com/..')).toThrow(SourceError);
  });

  it('rejects URL that resolves to "."', () => {
    expect(() => deriveSourceName('https://evil.com/.')).toThrow(SourceError);
  });

  it('rejects empty derived name', () => {
    expect(() => deriveSourceName('')).toThrow(SourceError);
  });
});

describe('normalizeSourceUrl', () => {
  it('strips trailing .git', () => {
    expect(normalizeSourceUrl('https://github.com/user/repo.git')).toBe('https://github.com/user/repo');
  });

  it('strips trailing slashes', () => {
    expect(normalizeSourceUrl('https://github.com/user/repo/')).toBe('https://github.com/user/repo');
  });

  it('strips both trailing slash and .git', () => {
    expect(normalizeSourceUrl('https://github.com/user/repo.git/')).toBe('https://github.com/user/repo');
  });

  it('returns unchanged URL if already clean', () => {
    expect(normalizeSourceUrl('https://github.com/user/repo')).toBe('https://github.com/user/repo');
  });

  it('makes .git and non-.git URLs compare equal', () => {
    const a = normalizeSourceUrl('https://github.com/user/repo.git');
    const b = normalizeSourceUrl('https://github.com/user/repo');
    expect(a).toBe(b);
  });

  it('converts GitHub SSH to HTTPS', () => {
    expect(normalizeSourceUrl('git@github.com:user/repo.git')).toBe('https://github.com/user/repo');
  });

  it('makes GitHub SSH and HTTPS compare equal', () => {
    const ssh = normalizeSourceUrl('git@github.com:user/repo.git');
    const https = normalizeSourceUrl('https://github.com/user/repo');
    expect(ssh).toBe(https);
  });

  it('does not convert non-GitHub SSH URLs', () => {
    expect(normalizeSourceUrl('git@gitlab.com:user/repo.git')).toBe('git@gitlab.com:user/repo');
  });
});

describe('validateSourceUrl', () => {
  it('accepts https URL', () => {
    expect(() => validateSourceUrl('https://github.com/user/skills.git')).not.toThrow();
  });

  it('accepts git@ SSH URL', () => {
    expect(() => validateSourceUrl('git@github.com:user/skills.git')).not.toThrow();
  });

  it('rejects file:// URL', () => {
    expect(() => validateSourceUrl('file:///etc/passwd')).toThrow(SourceError);
  });

  it('rejects empty string', () => {
    expect(() => validateSourceUrl('')).toThrow(SourceError);
  });

  it('rejects http URL', () => {
    expect(() => validateSourceUrl('http://github.com/user/skills')).toThrow(SourceError);
  });

  it('rejects bare path', () => {
    expect(() => validateSourceUrl('/some/local/path')).toThrow(SourceError);
  });
});

describe('SourceEntrySchema', () => {
  it('parses valid entry', () => {
    const entry = SourceEntrySchema.parse({
      name: 'my-source',
      url: 'https://github.com/user/skills.git',
      addedAt: '2025-01-01T00:00:00.000Z',
      skillCount: 5,
    });
    expect(entry.name).toBe('my-source');
    expect(entry.skillCount).toBe(5);
  });

  it('defaults skillCount to 0', () => {
    const entry = SourceEntrySchema.parse({
      name: 'my-source',
      url: 'https://github.com/user/skills.git',
      addedAt: '2025-01-01T00:00:00.000Z',
    });
    expect(entry.skillCount).toBe(0);
  });

  it('allows optional fields', () => {
    const entry = SourceEntrySchema.parse({
      name: 'my-source',
      url: 'https://github.com/user/skills.git',
      addedAt: '2025-01-01T00:00:00.000Z',
      lastSync: '2025-01-02T00:00:00.000Z',
      lastError: 'connection failed',
    });
    expect(entry.lastSync).toBeDefined();
    expect(entry.lastError).toBe('connection failed');
  });
});

describe('SourcesRegistrySchema', () => {
  it('parses valid registry', () => {
    const registry = SourcesRegistrySchema.parse({
      version: 1,
      sources: [
        {
          name: 'test',
          url: 'https://github.com/user/repo.git',
          addedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(registry.sources).toHaveLength(1);
  });

  it('defaults to empty sources', () => {
    const registry = SourcesRegistrySchema.parse({ version: 1 });
    expect(registry.sources).toEqual([]);
  });

  it('defaults version to 1', () => {
    const registry = SourcesRegistrySchema.parse({});
    expect(registry.version).toBe(1);
  });
});

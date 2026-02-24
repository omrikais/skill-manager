import { describe, it, expect } from 'vitest';
import { listPacks, loadPack, PackSchema } from '../../src/core/packs.js';
import { matchPackSkills } from '../../src/commands/pack.js';
import { PackNotFoundError, UsageError } from '../../src/utils/errors.js';
import type { RemoteSkill } from '../../src/sources/scanner.js';

describe('PackSchema', () => {
  it('parses valid pack', () => {
    const pack = PackSchema.parse({
      name: 'test-pack',
      displayName: 'Test Pack',
      description: 'A test pack',
      repos: ['https://github.com/user/repo'],
      skills: [{ slug: 'my-skill', repo: 'https://github.com/user/repo' }],
    });
    expect(pack.name).toBe('test-pack');
    expect(pack.skills).toHaveLength(1);
    expect(pack.version).toBe('1.0.0');
    expect(pack.tags).toEqual([]);
  });

  it('rejects pack without required fields', () => {
    expect(() => PackSchema.parse({ name: 'test' })).toThrow();
  });

  it('rejects pack with invalid skills', () => {
    expect(() =>
      PackSchema.parse({
        name: 'test',
        displayName: 'Test',
        description: 'test',
        repos: [],
        skills: [{ slug: 'ok' }], // missing repo
      })
    ).toThrow();
  });
});

describe('listPacks', () => {
  it('returns parsed packs from bundled packs/ dir', async () => {
    const packs = await listPacks();
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(pack.name).toBeTruthy();
      expect(pack.displayName).toBeTruthy();
      expect(pack.skills.length).toBeGreaterThan(0);
    }
  });

  it('packs are sorted by name', async () => {
    const packs = await listPacks();
    const names = packs.map((p) => p.name);
    expect(names).toEqual([...names].sort());
  });
});

describe('loadPack', () => {
  it('loads anthropic-official pack', async () => {
    const pack = await loadPack('anthropic-official');
    expect(pack.name).toBe('anthropic-official');
    expect(pack.displayName).toBe('Anthropic Official');
    expect(pack.skills.length).toBeGreaterThan(0);
  });

  it('throws PackNotFoundError for nonexistent pack', async () => {
    await expect(loadPack('nonexistent-pack')).rejects.toThrow(PackNotFoundError);
  });

  it('rejects pack names with path traversal', async () => {
    await expect(loadPack('../etc/passwd')).rejects.toThrow(UsageError);
    await expect(loadPack('foo/bar')).rejects.toThrow(UsageError);
    await expect(loadPack('foo\\bar')).rejects.toThrow(UsageError);
  });

  it('rejects bare dot names', async () => {
    await expect(loadPack('..')).rejects.toThrow(UsageError);
    await expect(loadPack('.')).rejects.toThrow(UsageError);
  });
});

describe('matchPackSkills', () => {
  const makeRemote = (slug: string, sourceUrl: string): RemoteSkill => ({
    slug,
    name: slug,
    description: '',
    tags: [],
    sourceName: 'test',
    sourceUrl,
    filePath: `/tmp/${slug}/SKILL.md`,
    dirPath: `/tmp/${slug}`,
    installed: false,
  });

  const repoA = 'https://github.com/org/repo-a';
  const repoB = 'https://github.com/org/repo-b';

  it('matches skill by both slug and repo', () => {
    const remoteSkills = [makeRemote('deploy', repoA)];
    const refs = [{ slug: 'deploy', repo: repoA }];

    const { matched, missing } = matchPackSkills(refs, remoteSkills);
    expect(matched).toHaveLength(1);
    expect(matched[0].slug).toBe('deploy');
    expect(missing).toEqual([]);
  });

  it('reports missing when slug matches but repo does not', () => {
    const remoteSkills = [makeRemote('deploy', repoA)];
    const refs = [{ slug: 'deploy', repo: repoB }];

    const { matched, missing } = matchPackSkills(refs, remoteSkills);
    expect(matched).toEqual([]);
    expect(missing).toEqual(['deploy']);
  });

  it('disambiguates same slug across different repos', () => {
    const remoteSkills = [
      makeRemote('deploy', repoA),
      makeRemote('deploy', repoB),
    ];
    const refs = [{ slug: 'deploy', repo: repoB }];

    const { matched, missing } = matchPackSkills(refs, remoteSkills);
    expect(matched).toHaveLength(1);
    expect(matched[0].sourceUrl).toBe(repoB);
    expect(missing).toEqual([]);
  });

  it('matches multiple skills from different repos', () => {
    const remoteSkills = [
      makeRemote('lint', repoA),
      makeRemote('deploy', repoB),
      makeRemote('deploy', repoA),
    ];
    const refs = [
      { slug: 'lint', repo: repoA },
      { slug: 'deploy', repo: repoB },
    ];

    const { matched, missing } = matchPackSkills(refs, remoteSkills);
    expect(matched).toHaveLength(2);
    expect(matched[0].slug).toBe('lint');
    expect(matched[0].sourceUrl).toBe(repoA);
    expect(matched[1].slug).toBe('deploy');
    expect(matched[1].sourceUrl).toBe(repoB);
    expect(missing).toEqual([]);
  });

  it('returns empty matched and missing for empty refs', () => {
    const { matched, missing } = matchPackSkills([], [makeRemote('x', repoA)]);
    expect(matched).toEqual([]);
    expect(missing).toEqual([]);
  });
});

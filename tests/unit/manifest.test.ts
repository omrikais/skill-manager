import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createEmptyManifest, resolveActiveSkills, saveManifest, type Manifest } from '../../src/core/manifest.js';

describe('createEmptyManifest', () => {
  it('returns a valid empty manifest', () => {
    const m = createEmptyManifest();
    expect(m.version).toBe(1);
    expect(m.skills).toEqual([]);
    expect(m.profiles).toEqual({});
  });
});

describe('saveManifest', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await fs.remove(tmpDir);
  });

  it('creates parent directory if it does not exist', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-manifest-'));
    const projectRoot = path.join(tmpDir, 'nonexistent', 'project');
    // projectRoot does not exist yet

    const manifest = createEmptyManifest();
    await saveManifest(projectRoot, manifest);

    const manifestPath = path.join(projectRoot, '.skills.json');
    expect(await fs.pathExists(manifestPath)).toBe(true);
    const saved = await fs.readJson(manifestPath);
    expect(saved.version).toBe(1);
  });
});

describe('resolveActiveSkills', () => {
  it('returns base skills when no active profile', () => {
    const m: Manifest = {
      version: 1,
      skills: [{ name: 'foo', tools: ['cc', 'codex'], scope: 'user' }],
      profiles: {},
    };
    const skills = resolveActiveSkills(m);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('foo');
  });

  it('merges profile skills into base skills', () => {
    const m: Manifest = {
      version: 1,
      skills: [{ name: 'foo', tools: ['cc', 'codex'], scope: 'user' }],
      profiles: {
        dev: {
          skills: [{ name: 'bar', tools: ['cc'], scope: 'user' }],
        },
      },
      activeProfile: 'dev',
    };
    const skills = resolveActiveSkills(m);
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name)).toContain('foo');
    expect(skills.map((s) => s.name)).toContain('bar');
  });

  it('does not duplicate skills already in base', () => {
    const m: Manifest = {
      version: 1,
      skills: [{ name: 'foo', tools: ['cc', 'codex'], scope: 'user' }],
      profiles: {
        dev: {
          skills: [{ name: 'foo', tools: ['cc'], scope: 'user' }],
        },
      },
      activeProfile: 'dev',
    };
    const skills = resolveActiveSkills(m);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('foo');
  });

  it('ignores nonexistent profile', () => {
    const m: Manifest = {
      version: 1,
      skills: [{ name: 'foo', tools: ['cc', 'codex'], scope: 'user' }],
      profiles: {},
      activeProfile: 'nonexistent',
    };
    const skills = resolveActiveSkills(m);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('foo');
  });

  it('handles empty skills and no profile', () => {
    const m = createEmptyManifest();
    const skills = resolveActiveSkills(m);
    expect(skills).toHaveLength(0);
  });
});

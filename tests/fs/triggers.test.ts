import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
});

describe('scanProjectSignals', () => {
  it('detects files and directories in a project', async () => {
    const { scanProjectSignals } = await import('../../src/core/triggers.js');

    const projectDir = path.join(os.tmpdir(), `sm-project-test-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'Cargo.toml'), '[package]\nname = "test"', 'utf-8');
    await fs.ensureDir(path.join(projectDir, 'src'));
    await fs.writeFile(path.join(projectDir, 'src', 'main.rs'), 'fn main() {}', 'utf-8');

    try {
      const signals = await scanProjectSignals(projectDir);

      expect(signals.files).toContain('Cargo.toml');
      expect(signals.files.some((f: string) => f.includes('main.rs'))).toBe(true);
      expect(signals.dirs).toContain('src');
      expect(signals.languages).toContain('rust');
    } finally {
      await fs.remove(projectDir);
    }
  });

  it('returns empty for empty directory', async () => {
    const { scanProjectSignals } = await import('../../src/core/triggers.js');

    const projectDir = path.join(os.tmpdir(), `sm-project-empty-${Date.now()}`);
    await fs.ensureDir(projectDir);

    try {
      const signals = await scanProjectSignals(projectDir);
      expect(signals.files).toEqual([]);
      expect(signals.languages).toEqual([]);
    } finally {
      await fs.remove(projectDir);
    }
  });
});

describe('matchSkillTriggers', () => {
  async function createTestSkill(
    slug: string,
    frontmatter: Record<string, unknown>,
    metaOverrides?: { deployAs?: { cc?: string; codex?: string } },
  ) {
    const { skillDir, skillFile, skillMetaFile } = await import('../../src/fs/paths.js');
    await fs.ensureDir(skillDir(slug));

    let yaml = '---\n';
    for (const [key, value] of Object.entries(frontmatter)) {
      if (key === 'triggers') {
        yaml += 'triggers:\n';
        const triggers = value as Record<string, string[]>;
        if (triggers.files) {
          yaml += '  files:\n';
          for (const f of triggers.files) {
            yaml += `    - "${f}"\n`;
          }
        }
        if (triggers.dirs) {
          yaml += '  dirs:\n';
          for (const d of triggers.dirs) {
            yaml += `    - "${d}"\n`;
          }
        }
      } else if (Array.isArray(value)) {
        yaml += `${key}: [${value.map((v) => `"${v}"`).join(', ')}]\n`;
      } else {
        yaml += `${key}: "${value}"\n`;
      }
    }
    yaml += '---\n\n# ' + slug;
    await fs.writeFile(skillFile(slug), yaml, 'utf-8');

    await fs.writeJson(skillMetaFile(slug), {
      format: 'skill',
      source: { type: 'created' },
      tags: [],
      deployAs: {
        cc: metaOverrides?.deployAs?.cc ?? 'skill',
        codex: metaOverrides?.deployAs?.codex ?? 'skill',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  it('matches skills with file triggers', async () => {
    const { matchSkillTriggers } = await import('../../src/core/triggers.js');
    const { listSkills } = await import('../../src/core/skill.js');

    await createTestSkill('rust-helper', {
      name: 'Rust Helper',
      description: 'Helps with Rust projects',
      triggers: { files: ['Cargo.toml', '*.rs'] },
    });

    const signals = {
      files: ['Cargo.toml', 'src/main.rs', 'README.md'],
      dirs: ['src'],
      languages: ['rust'],
    };

    const skills = await listSkills();
    const suggestions = await matchSkillTriggers(signals, skills);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].slug).toBe('rust-helper');
    expect(suggestions[0].confidence).toBe('high');
    expect(suggestions[0].matchedTriggers).toContain('Cargo.toml');
  });

  it('excludes skills without triggers', async () => {
    const { matchSkillTriggers } = await import('../../src/core/triggers.js');
    const { listSkills } = await import('../../src/core/skill.js');

    await createTestSkill('no-trigger', {
      name: 'No Trigger',
      description: 'No triggers defined',
    });

    const signals = {
      files: ['package.json'],
      dirs: ['src'],
      languages: ['typescript'],
    };

    const skills = await listSkills();
    const suggestions = await matchSkillTriggers(signals, skills);
    expect(suggestions).toHaveLength(0);
  });

  it('returns empty for no matching signals', async () => {
    const { matchSkillTriggers } = await import('../../src/core/triggers.js');
    const { listSkills } = await import('../../src/core/skill.js');

    await createTestSkill('python-helper', {
      name: 'Python Helper',
      triggers: { files: ['requirements.txt', 'setup.py'] },
    });

    const signals = {
      files: ['Cargo.toml'],
      dirs: ['src'],
      languages: ['rust'],
    };

    const skills = await listSkills();
    const suggestions = await matchSkillTriggers(signals, skills);
    expect(suggestions).toHaveLength(0);
  });

  it('marks skill as not deployed when only deployed to one of two target tools', async () => {
    const { matchSkillTriggers } = await import('../../src/core/triggers.js');
    const { listSkills } = await import('../../src/core/skill.js');
    const { addLinkRecord, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await createTestSkill('partial-skill', {
      name: 'Partial Skill',
      description: 'Partially deployed',
      triggers: { files: ['package.json'] },
    });

    // Deploy to cc only — codex is missing
    await addLinkRecord({
      slug: 'partial-skill',
      tool: 'cc',
      format: 'skill',
      linkPath: '/tmp/fake/cc',
      targetPath: '/tmp/fake/target',
      createdAt: new Date().toISOString(),
    });

    const skills = await listSkills();
    const suggestions = await matchSkillTriggers(
      { files: ['package.json'], dirs: [], languages: [] },
      skills,
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].isDeployed).toBe(false);
  });

  it('marks skill as deployed when deployed to all target tools', async () => {
    const { matchSkillTriggers } = await import('../../src/core/triggers.js');
    const { listSkills } = await import('../../src/core/skill.js');
    const { addLinkRecord, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await createTestSkill('full-skill', {
      name: 'Full Skill',
      description: 'Fully deployed',
      triggers: { files: ['package.json'] },
    });

    // Deploy to both cc and codex
    const now = new Date().toISOString();
    await addLinkRecord({
      slug: 'full-skill',
      tool: 'cc',
      format: 'skill',
      linkPath: '/tmp/fake/cc',
      targetPath: '/tmp/fake/target',
      createdAt: now,
    });
    await addLinkRecord({
      slug: 'full-skill',
      tool: 'codex',
      format: 'skill',
      linkPath: '/tmp/fake/codex',
      targetPath: '/tmp/fake/target',
      createdAt: now,
    });

    const skills = await listSkills();
    const suggestions = await matchSkillTriggers(
      { files: ['package.json'], dirs: [], languages: [] },
      skills,
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].isDeployed).toBe(true);
  });

  it('marks skill as deployed when deployed to its only target tool', async () => {
    const { matchSkillTriggers } = await import('../../src/core/triggers.js');
    const { listSkills } = await import('../../src/core/skill.js');
    const { addLinkRecord, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    // This skill only targets cc (codex is 'none')
    await createTestSkill('cc-only-skill', {
      name: 'CC Only',
      description: 'Only deploys to cc',
      triggers: { files: ['package.json'] },
    }, { deployAs: { cc: 'legacy-command', codex: 'none' } });

    await addLinkRecord({
      slug: 'cc-only-skill',
      tool: 'cc',
      format: 'legacy-command',
      linkPath: '/tmp/fake/cc',
      targetPath: '/tmp/fake/target',
      createdAt: new Date().toISOString(),
    });

    const skills = await listSkills();
    const suggestions = await matchSkillTriggers(
      { files: ['package.json'], dirs: [], languages: [] },
      skills,
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].isDeployed).toBe(true);
  });
});

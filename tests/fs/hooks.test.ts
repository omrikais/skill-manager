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

async function createTestSkill(
  slug: string,
  frontmatter: Record<string, unknown>,
  metaOverrides?: { deployAs?: { cc?: string; codex?: string }; lastUsed?: string; usageCount?: number },
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
    lastUsed: metaOverrides?.lastUsed,
    usageCount: metaOverrides?.usageCount ?? 0,
  });
}

describe('handleSessionStart', () => {
  it('suggests and deploys matching skills', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');

    await createTestSkill('rust-helper', {
      name: 'Rust Helper',
      description: 'Helps with Rust projects',
      triggers: { files: ['Cargo.toml', '*.rs'] },
    });

    // Create a project dir with Rust files
    const projectDir = path.join(os.tmpdir(), `sm-hook-test-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'Cargo.toml'), '[package]\nname = "test"', 'utf-8');
    await fs.ensureDir(path.join(projectDir, 'src'));
    await fs.writeFile(path.join(projectDir, 'src', 'main.rs'), 'fn main() {}', 'utf-8');

    try {
      const result = await handleSessionStart({
        session_id: 'test-1',
        cwd: projectDir,
        source: 'startup',
      });

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].slug).toBe('rust-helper');
      expect(result.deployed).toContain('rust-helper');
      expect(result.alreadyActive).toHaveLength(0);
    } finally {
      await fs.remove(projectDir);
    }
  });

  it('marks already-deployed skills as alreadyActive', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');
    const { addLinkRecord, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const { skillDir } = await import('../../src/fs/paths.js');

    await createTestSkill('node-helper', {
      name: 'Node Helper',
      description: 'Helps with Node.js projects',
      triggers: { files: ['package.json'] },
    });

    // Pre-deploy to both tools with real symlinks
    const now = new Date().toISOString();
    const target = skillDir('node-helper');
    const ccLink = path.join(os.tmpdir(), `sm-link-cc-${Date.now()}`);
    const codexLink = path.join(os.tmpdir(), `sm-link-codex-${Date.now()}`);
    await fs.ensureSymlink(target, ccLink);
    await fs.ensureSymlink(target, codexLink);

    await addLinkRecord({
      slug: 'node-helper',
      tool: 'cc',
      format: 'skill',
      linkPath: ccLink,
      targetPath: target,
      createdAt: now,
    });
    await addLinkRecord({
      slug: 'node-helper',
      tool: 'codex',
      format: 'skill',
      linkPath: codexLink,
      targetPath: target,
      createdAt: now,
    });

    const projectDir = path.join(os.tmpdir(), `sm-hook-active-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'package.json'), '{}', 'utf-8');

    try {
      const result = await handleSessionStart({
        session_id: 'test-2',
        cwd: projectDir,
        source: 'startup',
      });

      expect(result.suggestions).toHaveLength(1);
      expect(result.alreadyActive).toContain('node-helper');
      expect(result.deployed).toHaveLength(0);
    } finally {
      await fs.remove(projectDir);
      await fs.remove(ccLink);
      await fs.remove(codexLink);
    }
  });

  it('updates lastUsed and usageCount on matched skills', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');
    const { readMeta } = await import('../../src/core/meta.js');

    await createTestSkill('py-helper', {
      name: 'Python Helper',
      description: 'Helps with Python',
      triggers: { files: ['requirements.txt'] },
    }, { usageCount: 2 });

    const projectDir = path.join(os.tmpdir(), `sm-hook-usage-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'requirements.txt'), 'flask', 'utf-8');

    try {
      await handleSessionStart({
        session_id: 'test-3',
        cwd: projectDir,
        source: 'startup',
      });

      const meta = await readMeta('py-helper');
      expect(meta.lastUsed).toBeDefined();
      expect(meta.usageCount).toBe(3);
    } finally {
      await fs.remove(projectDir);
    }
  });

  it('returns empty result for empty project', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');

    await createTestSkill('rust-only', {
      name: 'Rust Only',
      description: 'Rust helper',
      triggers: { files: ['Cargo.toml'] },
    });

    const projectDir = path.join(os.tmpdir(), `sm-hook-empty-${Date.now()}`);
    await fs.ensureDir(projectDir);

    try {
      const result = await handleSessionStart({
        session_id: 'test-4',
        cwd: projectDir,
        source: 'startup',
      });

      expect(result.suggestions).toHaveLength(0);
      expect(result.deployed).toHaveLength(0);
      expect(result.alreadyActive).toHaveLength(0);
      expect(result.contextOutput).toBe('');
    } finally {
      await fs.remove(projectDir);
    }
  });

  it('auto-deploys dependencies before the triggered skill', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    // Create a dependency skill (no triggers — won't match on its own)
    await createTestSkill('lib-skill', {
      name: 'Lib Skill',
      description: 'A library dependency',
    });

    // Create a skill that depends on lib-skill and has triggers
    await createTestSkill('app-skill', {
      name: 'App Skill',
      description: 'App skill with dependency',
      depends: ['lib-skill'],
      triggers: { files: ['app.config'] },
    });

    const projectDir = path.join(os.tmpdir(), `sm-hook-deps-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'app.config'), 'config=true', 'utf-8');

    try {
      const result = await handleSessionStart({
        session_id: 'test-deps',
        cwd: projectDir,
        source: 'startup',
      });

      expect(result.deployed).toContain('app-skill');

      // Verify dependency was also deployed
      const depLinks = await getLinkRecords('lib-skill', { scope: 'user' });
      expect(depLinks.length).toBeGreaterThan(0);

      // Verify the triggered skill itself was deployed
      const appLinks = await getLinkRecords('app-skill', { scope: 'user' });
      expect(appLinks.length).toBeGreaterThan(0);
    } finally {
      await fs.remove(projectDir);
    }
  });

  it('skips tool when dependency cannot deploy to that tool', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    // dep-lib deploys to codex only (cc = 'none')
    await createTestSkill('dep-lib', {
      name: 'Dep Lib',
      description: 'Codex-only dependency',
    }, { deployAs: { cc: 'none', codex: 'skill' } });

    // parent targets both cc+codex and depends on dep-lib
    await createTestSkill('parent-skill', {
      name: 'Parent Skill',
      description: 'Depends on codex-only lib',
      depends: ['dep-lib'],
      triggers: { files: ['trigger.txt'] },
    });

    const projectDir = path.join(os.tmpdir(), `sm-hook-tool-skip-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'trigger.txt'), '', 'utf-8');

    try {
      const result = await handleSessionStart({
        session_id: 'test-tool-skip',
        cwd: projectDir,
        source: 'startup',
      });

      expect(result.deployed).toContain('parent-skill');

      // parent should NOT be deployed to cc (dep can't satisfy cc)
      const parentLinks = await getLinkRecords('parent-skill', { scope: 'user' });
      const ccLinks = parentLinks.filter((l) => l.tool === 'cc');
      expect(ccLinks).toHaveLength(0);

      // parent SHOULD be deployed to codex (dep satisfied codex)
      const codexLinks = parentLinks.filter((l) => l.tool === 'codex');
      expect(codexLinks).toHaveLength(1);
    } finally {
      await fs.remove(projectDir);
    }
  });

  it('skips deployment when dependencies have circular reference', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');

    // Create two skills that depend on each other
    await createTestSkill('cycle-a', {
      name: 'Cycle A',
      description: 'Circular dep A',
      depends: ['cycle-b'],
      triggers: { files: ['cycle.txt'] },
    });
    await createTestSkill('cycle-b', {
      name: 'Cycle B',
      description: 'Circular dep B',
      depends: ['cycle-a'],
    });

    const projectDir = path.join(os.tmpdir(), `sm-hook-cycle-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'cycle.txt'), '', 'utf-8');

    try {
      const result = await handleSessionStart({
        session_id: 'test-cycle',
        cwd: projectDir,
        source: 'startup',
      });

      // Skill should be suggested but NOT deployed due to circular deps
      expect(result.suggestions).toHaveLength(1);
      expect(result.deployed).not.toContain('cycle-a');
    } finally {
      await fs.remove(projectDir);
    }
  });

  it('does not report deployed for skills with no deployable tools', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');

    await createTestSkill('no-deploy-skill', {
      name: 'No Deploy',
      description: 'Has no deploy targets',
      triggers: { files: ['special.txt'] },
    }, { deployAs: { cc: 'none', codex: 'none' } });

    const projectDir = path.join(os.tmpdir(), `sm-hook-nodeploy-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'special.txt'), '', 'utf-8');

    try {
      const result = await handleSessionStart({
        session_id: 'test-nodeploy',
        cwd: projectDir,
        source: 'startup',
      });

      expect(result.suggestions).toHaveLength(1);
      expect(result.deployed).not.toContain('no-deploy-skill');
      expect(result.alreadyActive).not.toContain('no-deploy-skill');
    } finally {
      await fs.remove(projectDir);
    }
  });

  it('does not record usage for skills that fail to deploy', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');
    const { readMeta } = await import('../../src/core/meta.js');

    // Skill with missing dependency — deployment should be skipped
    await createTestSkill('orphan-skill', {
      name: 'Orphan Skill',
      description: 'Has missing dep',
      depends: ['nonexistent-dep'],
      triggers: { files: ['orphan.txt'] },
    }, { usageCount: 0 });

    const projectDir = path.join(os.tmpdir(), `sm-hook-nousage-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'orphan.txt'), '', 'utf-8');

    try {
      await handleSessionStart({
        session_id: 'test-nousage',
        cwd: projectDir,
        source: 'startup',
      });

      const meta = await readMeta('orphan-skill');
      expect(meta.usageCount).toBe(0);
      expect(meta.lastUsed).toBeUndefined();
    } finally {
      await fs.remove(projectDir);
    }
  });

  it('context output contains skill names', async () => {
    const { handleSessionStart } = await import('../../src/core/hooks.js');

    await createTestSkill('go-helper', {
      name: 'Go Helper',
      description: 'Helps with Go projects',
      triggers: { files: ['go.mod'] },
    });

    const projectDir = path.join(os.tmpdir(), `sm-hook-ctx-${Date.now()}`);
    await fs.ensureDir(projectDir);
    await fs.writeFile(path.join(projectDir, 'go.mod'), 'module example', 'utf-8');

    try {
      const result = await handleSessionStart({
        session_id: 'test-5',
        cwd: projectDir,
        source: 'startup',
      });

      expect(result.contextOutput).toContain('[Skill Manager]');
      expect(result.contextOutput).toContain('Go Helper');
      expect(result.contextOutput).toContain('go-helper');
    } finally {
      await fs.remove(projectDir);
    }
  });
});

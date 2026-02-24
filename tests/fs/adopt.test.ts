import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
});

/** Create a minimal managed skill in the canonical store */
async function createManagedSkill(slug: string) {
  const { skillDir, skillFile, skillMetaFile } = await import('../../src/fs/paths.js');
  await fs.ensureDir(skillDir(slug));
  await fs.writeFile(skillFile(slug), `---\nname: "${slug}"\n---\n\n# ${slug}`, 'utf-8');
  await fs.writeJson(skillMetaFile(slug), {
    format: 'skill',
    source: { type: 'created' },
    tags: [],
    deployAs: { cc: 'skill', codex: 'skill' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

describe('detectUnmanaged', () => {
  it('detects flat .md files in CC commands dir', async () => {
    const { CC_COMMANDS_DIR } = await import('../../src/fs/paths.js');
    const { detectUnmanaged } = await import('../../src/core/adopt.js');

    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(path.join(CC_COMMANDS_DIR, 'test-skill.md'), '# Test', 'utf-8');

    const entries = await detectUnmanaged();
    expect(entries).toHaveLength(1);
    expect(entries[0].slug).toBe('test-skill');
    expect(entries[0].isDirectory).toBe(false);
    expect(entries[0].tool).toBe('cc');
    expect(entries[0].format).toBe('legacy-command');
  });

  it('detects skill directories in CC skills dir', async () => {
    const { CC_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { detectUnmanaged } = await import('../../src/core/adopt.js');

    const skillDir = path.join(CC_SKILLS_DIR, 'my-skill');
    await fs.ensureDir(skillDir);
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# My Skill', 'utf-8');

    const entries = await detectUnmanaged();
    expect(entries).toHaveLength(1);
    expect(entries[0].slug).toBe('my-skill');
    expect(entries[0].isDirectory).toBe(true);
    expect(entries[0].tool).toBe('cc');
    expect(entries[0].format).toBe('skill');
  });

  it('detects flat .md files in Codex prompts dir', async () => {
    const { CODEX_PROMPTS_DIR } = await import('../../src/fs/paths.js');
    const { detectUnmanaged } = await import('../../src/core/adopt.js');

    await fs.ensureDir(CODEX_PROMPTS_DIR);
    await fs.writeFile(path.join(CODEX_PROMPTS_DIR, 'codex-skill.md'), '# Codex', 'utf-8');

    const entries = await detectUnmanaged();
    expect(entries).toHaveLength(1);
    expect(entries[0].slug).toBe('codex-skill');
    expect(entries[0].tool).toBe('codex');
    expect(entries[0].format).toBe('legacy-prompt');
  });

  it('skips sm-managed symlinks', async () => {
    const { CC_SKILLS_DIR, SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { detectUnmanaged } = await import('../../src/core/adopt.js');

    // Create a managed skill and symlink to it
    await createManagedSkill('managed');
    const target = path.join(SM_SKILLS_DIR, 'managed');
    const link = path.join(CC_SKILLS_DIR, 'managed');
    await fs.ensureDir(CC_SKILLS_DIR);
    await fs.symlink(target, link);

    const entries = await detectUnmanaged();
    expect(entries).toHaveLength(0);
  });

  it('skips external symlinks', async () => {
    const { CC_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { detectUnmanaged } = await import('../../src/core/adopt.js');

    // External symlink to some other directory
    const externalDir = path.join(tmp.home, 'external-skill');
    await fs.ensureDir(externalDir);
    await fs.writeFile(path.join(externalDir, 'SKILL.md'), '# External', 'utf-8');

    await fs.ensureDir(CC_SKILLS_DIR);
    await fs.symlink(externalDir, path.join(CC_SKILLS_DIR, 'external'));

    const entries = await detectUnmanaged();
    expect(entries).toHaveLength(0);
  });

  it('skips dot-prefixed entries', async () => {
    const { CC_COMMANDS_DIR } = await import('../../src/fs/paths.js');
    const { detectUnmanaged } = await import('../../src/core/adopt.js');

    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(path.join(CC_COMMANDS_DIR, '.hidden.md'), '# Hidden', 'utf-8');

    const entries = await detectUnmanaged();
    expect(entries).toHaveLength(0);
  });

  it('skips directories without any .md files', async () => {
    const { CC_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { detectUnmanaged } = await import('../../src/core/adopt.js');

    const emptyDir = path.join(CC_SKILLS_DIR, 'empty-dir');
    await fs.ensureDir(emptyDir);
    await fs.writeFile(path.join(emptyDir, 'readme.txt'), 'not a skill', 'utf-8');

    const entries = await detectUnmanaged();
    expect(entries).toHaveLength(0);
  });

  it('detects project-level skills', async () => {
    const { detectUnmanaged } = await import('../../src/core/adopt.js');

    const projectRoot = path.join(tmp.home, 'my-project');
    const ccSkillsDir = path.join(projectRoot, '.claude', 'skills', 'proj-skill');
    await fs.ensureDir(ccSkillsDir);
    await fs.writeFile(path.join(ccSkillsDir, 'SKILL.md'), '# Project Skill', 'utf-8');

    const entries = await detectUnmanaged({ projectRoot });
    const projectEntries = entries.filter(e => e.scope === 'project');
    expect(projectEntries).toHaveLength(1);
    expect(projectEntries[0].slug).toBe('proj-skill');
    expect(projectEntries[0].scope).toBe('project');
    expect(projectEntries[0].projectRoot).toBe(projectRoot);
  });
});

describe('resolveUniqueSlug', () => {
  it('returns base slug when no conflict', async () => {
    const { resolveUniqueSlug } = await import('../../src/core/adopt.js');
    const slug = await resolveUniqueSlug('new-skill');
    expect(slug).toBe('new-skill');
  });

  it('appends -2 on first conflict', async () => {
    const { resolveUniqueSlug } = await import('../../src/core/adopt.js');
    await createManagedSkill('existing');
    const slug = await resolveUniqueSlug('existing');
    expect(slug).toBe('existing-2');
  });

  it('increments suffix until unique', async () => {
    const { resolveUniqueSlug } = await import('../../src/core/adopt.js');
    await createManagedSkill('dup');
    await createManagedSkill('dup-2');
    await createManagedSkill('dup-3');
    const slug = await resolveUniqueSlug('dup');
    expect(slug).toBe('dup-4');
  });
});

describe('autoAdopt', () => {
  it('adopts a flat .md from CC commands dir', async () => {
    const { CC_COMMANDS_DIR, SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(path.join(CC_COMMANDS_DIR, 'adopt-me.md'), '# Adopt Me\n\nSome content', 'utf-8');

    const result = await autoAdopt();

    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].finalSlug).toBe('adopt-me');

    // Canonical copy exists
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'adopt-me', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'adopt-me', '.sm-meta.json'))).toBe(true);

    // Original is now a symlink
    const linkPath = path.join(CC_COMMANDS_DIR, 'adopt-me.md');
    const stat = await fs.lstat(linkPath);
    expect(stat.isSymbolicLink()).toBe(true);

    // Meta has adopted source
    const meta = await fs.readJson(path.join(SM_SKILLS_DIR, 'adopt-me', '.sm-meta.json'));
    expect(meta.source.type).toBe('adopted');
    expect(meta.deployAs.cc).toBe('legacy-command');
    expect(meta.deployAs.codex).toBe('none');
  });

  it('adopts a skill directory from CC skills dir', async () => {
    const { CC_SKILLS_DIR, SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const skillPath = path.join(CC_SKILLS_DIR, 'dir-skill');
    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), '# Dir Skill\n\nContent here', 'utf-8');

    const result = await autoAdopt();

    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].finalSlug).toBe('dir-skill');

    // Canonical copy exists
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'dir-skill', 'SKILL.md'))).toBe(true);

    // Original is replaced with a symlink
    const stat = await fs.lstat(path.join(CC_SKILLS_DIR, 'dir-skill'));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('copies references/ when adopting a directory skill', async () => {
    const { CC_SKILLS_DIR, SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const skillPath = path.join(CC_SKILLS_DIR, 'ref-skill');
    await fs.ensureDir(path.join(skillPath, 'references'));
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), '# Ref Skill', 'utf-8');
    await fs.writeFile(path.join(skillPath, 'references', 'guide.md'), '# Guide', 'utf-8');

    const result = await autoAdopt();

    expect(result.adopted).toHaveLength(1);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'ref-skill', 'references', 'guide.md'))).toBe(true);
  });

  it('handles slug conflicts with numeric suffix', async () => {
    const { CC_COMMANDS_DIR, SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    // Pre-existing managed skill with same slug
    await createManagedSkill('conflict');

    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(path.join(CC_COMMANDS_DIR, 'conflict.md'), '# Conflict', 'utf-8');

    const result = await autoAdopt();

    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].originalSlug).toBe('conflict');
    expect(result.adopted[0].finalSlug).toBe('conflict-2');
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'conflict-2', 'SKILL.md'))).toBe(true);
  });

  it('skips empty files', async () => {
    const { CC_COMMANDS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(path.join(CC_COMMANDS_DIR, 'empty.md'), '', 'utf-8');

    const result = await autoAdopt();

    expect(result.adopted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('Empty file');
    // Original still exists (not removed)
    expect(await fs.pathExists(path.join(CC_COMMANDS_DIR, 'empty.md'))).toBe(true);
  });

  it('respects debounce window', async () => {
    const { CC_COMMANDS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache, updateLastAdoptScan } = await import('../../src/core/state.js');
    resetStateCache();

    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(path.join(CC_COMMANDS_DIR, 'debounce-test.md'), '# Debounce', 'utf-8');

    // Set a recent scan timestamp
    await updateLastAdoptScan();

    const result = await autoAdopt();

    // Should skip due to debounce
    expect(result.adopted).toHaveLength(0);

    // File should still be there (not adopted)
    expect(await fs.pathExists(path.join(CC_COMMANDS_DIR, 'debounce-test.md'))).toBe(true);
  });

  it('respects autoAdopt=false config', async () => {
    const { CC_COMMANDS_DIR, SM_CONFIG_FILE, SM_HOME } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    const { resetConfigCache } = await import('../../src/core/config.js');
    resetStateCache();
    resetConfigCache();

    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(path.join(CC_COMMANDS_DIR, 'disabled.md'), '# Disabled', 'utf-8');

    // Write config with autoAdopt=false
    await fs.ensureDir(SM_HOME);
    await fs.writeFile(SM_CONFIG_FILE, 'autoAdopt = false\n', 'utf-8');

    const result = await autoAdopt();

    expect(result.adopted).toHaveLength(0);
    expect(await fs.pathExists(path.join(CC_COMMANDS_DIR, 'disabled.md'))).toBe(true);
  });

  it('skips sm-managed symlinks during adoption', async () => {
    const { CC_SKILLS_DIR, SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    // Create a managed skill with symlink
    await createManagedSkill('managed-one');
    await fs.ensureDir(CC_SKILLS_DIR);
    await fs.symlink(path.join(SM_SKILLS_DIR, 'managed-one'), path.join(CC_SKILLS_DIR, 'managed-one'));

    const result = await autoAdopt();
    expect(result.adopted).toHaveLength(0);
  });

  it('adopts from Codex prompts dir with correct format', async () => {
    const { CODEX_PROMPTS_DIR, SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await fs.ensureDir(CODEX_PROMPTS_DIR);
    await fs.writeFile(path.join(CODEX_PROMPTS_DIR, 'codex-adopted.md'), '# Codex Adopted', 'utf-8');

    const result = await autoAdopt();

    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].finalSlug).toBe('codex-adopted');

    const meta = await fs.readJson(path.join(SM_SKILLS_DIR, 'codex-adopted', '.sm-meta.json'));
    expect(meta.source.type).toBe('adopted');
    expect(meta.deployAs.codex).toBe('legacy-prompt');
    expect(meta.deployAs.cc).toBe('none');
  });

  it('records state link after adoption', async () => {
    const { CC_COMMANDS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache, getLinkRecords } = await import('../../src/core/state.js');
    resetStateCache();

    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(path.join(CC_COMMANDS_DIR, 'tracked.md'), '# Tracked', 'utf-8');

    await autoAdopt();

    const links = await getLinkRecords('tracked');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].tool).toBe('cc');
  });

  it('adopts project-level skills with correct scope', async () => {
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { autoAdopt } = await import('../../src/core/adopt.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const projectRoot = path.join(tmp.home, 'test-project');
    const ccSkillsDir = path.join(projectRoot, '.claude', 'skills', 'proj-skill');
    await fs.ensureDir(ccSkillsDir);
    await fs.writeFile(path.join(ccSkillsDir, 'SKILL.md'), '# Project Skill', 'utf-8');

    const result = await autoAdopt({ projectRoot });

    const projectAdopted = result.adopted.filter(a => a.finalSlug === 'proj-skill');
    expect(projectAdopted).toHaveLength(1);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'proj-skill', 'SKILL.md'))).toBe(true);

    // Project directory should now have a symlink
    const linkPath = path.join(projectRoot, '.claude', 'skills', 'proj-skill');
    const stat = await fs.lstat(linkPath);
    expect(stat.isSymbolicLink()).toBe(true);
  });
});

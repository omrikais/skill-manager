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

async function createFakeRepo(baseDir: string): Promise<string> {
  const repoDir = path.join(baseDir, 'fake-repo');
  await fs.ensureDir(repoDir);

  // Skill in subdirectory with SKILL.md
  const skillADir = path.join(repoDir, 'skill-a');
  await fs.ensureDir(skillADir);
  await fs.writeFile(path.join(skillADir, 'SKILL.md'), `---
name: Skill A
description: First test skill
tags: [test]
---
# Skill A content
`);

  // Skill in subdirectory with SKILL.md (was .md fallback, now proper SKILL.md)
  const skillBDir = path.join(repoDir, 'skill-b');
  await fs.ensureDir(skillBDir);
  await fs.writeFile(path.join(skillBDir, 'SKILL.md'), `---
name: Skill B
description: Second test skill
---
# Skill B content
`);

  // Top-level standalone .md
  await fs.writeFile(path.join(repoDir, 'standalone-skill.md'), `---
name: Standalone Skill
description: A standalone skill
---
# Standalone content
`);

  // Nested skill 3 levels deep: vendor/skills/nested-skill/SKILL.md
  const nestedDir = path.join(repoDir, 'vendor', 'skills', 'nested-skill');
  await fs.ensureDir(nestedDir);
  await fs.writeFile(path.join(nestedDir, 'SKILL.md'), `---
name: Nested Skill
description: A deeply nested skill
tags: [nested]
---
# Nested content
`);

  // Organizational dir with CLAUDE.md that should NOT become a skill
  const claudeDir = path.join(repoDir, 'claude');
  const claudeSkillsDir = path.join(claudeDir, 'skills');
  await fs.ensureDir(claudeSkillsDir);
  await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Claude config');
  // Skill nested inside claude/skills/
  const innerSkillDir = path.join(claudeSkillsDir, 'inner-skill');
  await fs.ensureDir(innerSkillDir);
  await fs.writeFile(path.join(innerSkillDir, 'SKILL.md'), `---
name: Inner Skill
description: Inside claude/skills
---
# Inner content
`);

  // docs/ dir with a non-skill .md (should NOT be picked up)
  const docsDir = path.join(repoDir, 'docs');
  await fs.ensureDir(docsDir);
  await fs.writeFile(path.join(docsDir, 'SKILL-GUIDE.md'), '# How to write skills');

  // CONTRIBUTING.md at repo root (should be ignored via IGNORE_FILES)
  await fs.writeFile(path.join(repoDir, 'CONTRIBUTING.md'), '# Contributing guidelines');

  // AGENTS.md at repo root — no frontmatter name, should NOT be a skill
  await fs.writeFile(path.join(repoDir, 'AGENTS.md'), '# Agent configuration\nSome agent setup docs.');

  // TODO.md at repo root — no frontmatter at all, should NOT be a skill
  await fs.writeFile(path.join(repoDir, 'TODO.md'), '# TODO\n- fix stuff');

  // nameless-skill.md — has description/tags but no name, should be discovered
  await fs.writeFile(path.join(repoDir, 'nameless-skill.md'), `---
description: A skill without a name field
tags: [test]
---
# Nameless skill content
`);

  // Generic "skill" directory with frontmatter name
  const genericSkillDir = path.join(repoDir, 'skill');
  await fs.ensureDir(genericSkillDir);
  await fs.writeFile(path.join(genericSkillDir, 'SKILL.md'), `---
name: Real Name
description: A skill in a generic directory
tags: [generic]
---
# Real content
`);

  // Files that should be ignored
  await fs.writeFile(path.join(repoDir, 'README.md'), '# My Repo');
  await fs.writeFile(path.join(repoDir, 'LICENSE'), 'MIT');
  await fs.ensureDir(path.join(repoDir, '.git'));
  await fs.writeFile(path.join(repoDir, '.git', 'config'), 'git config');
  await fs.ensureDir(path.join(repoDir, 'node_modules'));

  return repoDir;
}

describe('scanSourceRepo', () => {
  it('scans subdirectories, nested skills, and top-level .md files', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');

    const slugs = skills.map((s) => s.slug);
    expect(slugs).toContain('skill-a');
    expect(slugs).toContain('skill-b');
    expect(slugs).toContain('standalone-skill');
    expect(slugs).toContain('nested-skill');
    expect(slugs).toContain('inner-skill');
    expect(slugs).toContain('real-name');
    expect(slugs).toContain('nameless-skill');
    expect(skills.length).toBe(7);
  });

  it('discovers skills nested in subdirectories', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const nested = skills.find((s) => s.slug === 'nested-skill')!;

    expect(nested).toBeDefined();
    expect(nested.name).toBe('Nested Skill');
    expect(nested.description).toBe('A deeply nested skill');
    expect(nested.tags).toContain('nested');
    expect(nested.filePath).toContain(path.join('vendor', 'skills', 'nested-skill', 'SKILL.md'));
  });

  it('does not treat organizational dirs with subdirs as skills via .md fallback', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const slugs = skills.map((s) => s.slug);

    // 'claude' dir has CLAUDE.md but also has subdirectories — should not be a skill
    expect(slugs).not.toContain('claude');
  });

  it('deduplicates skills with the same slug at different depths', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = path.join(tmp.home, 'dedup-repo');
    await fs.ensureDir(repoDir);

    // Top-level skill-a
    const topDir = path.join(repoDir, 'skill-a');
    await fs.ensureDir(topDir);
    await fs.writeFile(path.join(topDir, 'SKILL.md'), `---
name: Top Skill A
---
# Top
`);

    // Nested duplicate skill-a
    const nestedDir = path.join(repoDir, 'vendor', 'skill-a');
    await fs.ensureDir(nestedDir);
    await fs.writeFile(path.join(nestedDir, 'SKILL.md'), `---
name: Nested Skill A
---
# Nested
`);

    const skills = await scanSourceRepo(repoDir, 'test', 'https://example.com/test.git');
    const matches = skills.filter((s) => s.slug === 'skill-a');

    expect(matches.length).toBe(1);
    // First found wins — top-level is scanned before nested
    expect(matches[0].name).toBe('Top Skill A');
  });

  it('parses frontmatter correctly', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const skillA = skills.find((s) => s.slug === 'skill-a')!;

    expect(skillA.name).toBe('Skill A');
    expect(skillA.description).toBe('First test skill');
    expect(skillA.tags).toContain('test');
    expect(skillA.sourceName).toBe('test-source');
    expect(skillA.sourceUrl).toBe('https://example.com/test.git');
  });

  it('ignores .git/, node_modules/, README.md, LICENSE', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const slugs = skills.map((s) => s.slug);

    expect(slugs).not.toContain('.git');
    expect(slugs).not.toContain('node_modules');
    expect(slugs).not.toContain('README');
    expect(slugs).not.toContain('LICENSE');
  });

  it('handles empty directory gracefully', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const emptyDir = path.join(tmp.home, 'empty-repo');
    await fs.ensureDir(emptyDir);

    const skills = await scanSourceRepo(emptyDir, 'empty', 'https://example.com/empty.git');
    expect(skills).toEqual([]);
  });

  it('handles nonexistent directory gracefully', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const skills = await scanSourceRepo('/nonexistent/path', 'test', 'https://example.com/test.git');
    expect(skills).toEqual([]);
  });

  it('sets installed=true for skills that exist in SM_SKILLS_DIR', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const { SM_SKILLS_DIR, skillFile } = await import('../../src/fs/paths.js');

    const repoDir = await createFakeRepo(tmp.home);

    // Create a matching skill in the canonical store
    await fs.ensureDir(path.join(SM_SKILLS_DIR, 'skill-a'));
    await fs.writeFile(skillFile('skill-a'), '# Existing skill');

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const skillA = skills.find((s) => s.slug === 'skill-a')!;
    const skillB = skills.find((s) => s.slug === 'skill-b')!;

    expect(skillA.installed).toBe(true);
    expect(skillB.installed).toBe(false);
  });

  it('returns skills sorted by slug', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const slugs = skills.map((s) => s.slug);
    expect(slugs).toEqual([...slugs].sort());
  });

  it('ignores leaf directories without SKILL.md', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const slugs = skills.map((s) => s.slug);

    // docs/ has SKILL-GUIDE.md but no SKILL.md — should not be picked up
    expect(slugs).not.toContain('docs');
  });

  it('uses frontmatter name as slug for generic dir names', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const slugs = skills.map((s) => s.slug);

    // "skill" dir has frontmatter name "Real Name" → slug "real-name"
    expect(slugs).not.toContain('skill');
    expect(slugs).toContain('real-name');

    const realName = skills.find((s) => s.slug === 'real-name')!;
    expect(realName.name).toBe('Real Name');
    expect(realName.description).toBe('A skill in a generic directory');
    expect(realName.tags).toContain('generic');
  });

  it('ignores CONTRIBUTING.md at top level', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const slugs = skills.map((s) => s.slug);

    expect(slugs).not.toContain('CONTRIBUTING');
  });

  it('ignores top-level .md files without any skill frontmatter', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = await createFakeRepo(tmp.home);

    const skills = await scanSourceRepo(repoDir, 'test-source', 'https://example.com/test.git');
    const slugs = skills.map((s) => s.slug);

    // AGENTS.md and TODO.md have no frontmatter at all — should not be skills
    expect(slugs).not.toContain('AGENTS');
    expect(slugs).not.toContain('TODO');
    // standalone-skill.md has a frontmatter name — should be found
    expect(slugs).toContain('standalone-skill');
    // nameless-skill.md has description/tags but no name — should still be found
    expect(slugs).toContain('nameless-skill');
  });

  it('falls back to dir name when generic dir has no frontmatter name', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = path.join(tmp.home, 'fallback-repo');
    await fs.ensureDir(repoDir);

    // "skill" dir with no frontmatter name
    const skillDir = path.join(repoDir, 'skill');
    await fs.ensureDir(skillDir);
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), `# Just content, no frontmatter`);

    const skills = await scanSourceRepo(repoDir, 'test', 'https://example.com/test.git');
    expect(skills.length).toBe(1);
    expect(skills[0].slug).toBe('skill');
  });

  it('picks up root SKILL.md with slug from frontmatter name', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = path.join(tmp.home, 'single-skill-repo');
    await fs.ensureDir(repoDir);

    await fs.writeFile(path.join(repoDir, 'SKILL.md'), `---
name: My Single Skill
description: A single-skill repo
---
# Content
`);
    await fs.ensureDir(path.join(repoDir, 'references'));
    await fs.writeFile(path.join(repoDir, 'references', 'api.md'), 'API docs');

    const skills = await scanSourceRepo(repoDir, 'test', 'https://example.com/test.git');
    expect(skills.length).toBe(1);
    expect(skills[0].slug).toBe('my-single-skill');
    expect(skills[0].name).toBe('My Single Skill');
  });

  it('skips root SKILL.md without frontmatter name', async () => {
    const { scanSourceRepo } = await import('../../src/sources/scanner.js');
    const repoDir = path.join(tmp.home, 'unnamed-skill-repo');
    await fs.ensureDir(repoDir);

    await fs.writeFile(path.join(repoDir, 'SKILL.md'), '# Just content, no frontmatter');

    const skills = await scanSourceRepo(repoDir, 'test', 'https://example.com/test.git');
    expect(skills.length).toBe(0);
  });
});

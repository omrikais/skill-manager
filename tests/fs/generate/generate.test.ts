import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-gen-e2e-'));
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

async function importModules() {
  const { collectProjectFacts } = await import('../../../src/core/generate/collector.js');
  const { inferProjectMeta } = await import('../../../src/core/generate/heuristics.js');
  const { buildAllSections } = await import('../../../src/core/generate/sections.js');
  const { renderSections } = await import('../../../src/core/generate/renderer.js');
  const { mergeContent, hasManagedBlocks } = await import('../../../src/core/generate/merge.js');
  return { collectProjectFacts, inferProjectMeta, buildAllSections, renderSections, mergeContent, hasManagedBlocks };
}

describe('end-to-end generate', () => {
  it('collects, infers, renders for a Node.js project', async () => {
    // Setup fixtures
    await fs.writeJson(path.join(tmpDir, 'package.json'), {
      name: 'my-app',
      description: 'A test application',
      type: 'module',
      scripts: { build: 'tsc', test: 'vitest', lint: 'eslint .' },
      dependencies: { express: '^4' },
      devDependencies: { vitest: '^1', typescript: '^5' },
    });
    await fs.writeJson(path.join(tmpDir, 'tsconfig.json'), {
      compilerOptions: { strict: true },
    });
    await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
    await fs.ensureDir(path.join(tmpDir, 'src'));
    await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export {}');
    await fs.ensureDir(path.join(tmpDir, 'tests'));
    await fs.writeFile(path.join(tmpDir, 'vitest.config.ts'), 'export default {}');

    const { collectProjectFacts, inferProjectMeta, buildAllSections, renderSections } = await importModules();

    const facts = await collectProjectFacts(tmpDir);
    const meta = inferProjectMeta(facts);
    const sections = buildAllSections(meta, 'claude-md', 'inline', { includeSkills: false, withMcp: false });
    const content = renderSections(sections);

    // Verify content
    expect(content).toContain('my-app');
    expect(content).toContain('A test application');
    expect(content).toContain('pnpm');
    expect(content).toContain('Express');
    expect(content).toContain('Vitest');
    expect(content).toContain('<!-- sm:begin identity -->');
    expect(content).toContain('<!-- sm:end identity -->');
    expect(content).toContain('<!-- sm:begin commands -->');
  });

  it('write then re-generate preserves user content', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), {
      name: 'my-app',
      scripts: { build: 'tsc' },
    });
    await fs.ensureDir(path.join(tmpDir, 'src'));

    const { collectProjectFacts, inferProjectMeta, buildAllSections, renderSections, mergeContent } = await importModules();

    // First generation
    const facts1 = await collectProjectFacts(tmpDir);
    const meta1 = inferProjectMeta(facts1);
    const sections1 = buildAllSections(meta1, 'claude-md', 'inline', { includeSkills: false, withMcp: false });
    const content1 = renderSections(sections1);

    // Write it
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    await fs.writeFile(claudeMdPath, content1);

    // User adds their own content
    const withUserContent = content1 + '\n## My Custom Section\n\nCustom notes here.\n';
    await fs.writeFile(claudeMdPath, withUserContent);

    // Re-generate (modify project to get different output)
    await fs.writeJson(path.join(tmpDir, 'package.json'), {
      name: 'my-app',
      description: 'Updated description',
      scripts: { build: 'tsc', test: 'vitest' },
    });

    const facts2 = await collectProjectFacts(tmpDir);
    const meta2 = inferProjectMeta(facts2);
    const sections2 = buildAllSections(meta2, 'claude-md', 'inline', { includeSkills: false, withMcp: false });

    const existing = await fs.readFile(claudeMdPath, 'utf-8');
    const mergeResult = mergeContent(existing, sections2);

    // Verify
    expect(mergeResult.content).toContain('Updated description');
    expect(mergeResult.content).toContain('## My Custom Section');
    expect(mergeResult.content).toContain('Custom notes here.');
    expect(mergeResult.sectionsUpdated.length).toBeGreaterThan(0);
  });

  it('summary mode produces compact output', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), {
      name: 'compact-app',
      scripts: { build: 'tsc' },
    });

    const { collectProjectFacts, inferProjectMeta, buildAllSections, renderSections } = await importModules();

    const facts = await collectProjectFacts(tmpDir);
    const meta = inferProjectMeta(facts);
    const sections = buildAllSections(meta, 'claude-md', 'summary', { includeSkills: false, withMcp: false });
    const content = renderSections(sections);

    // Summary mode identity doesn't use #
    expect(content).toContain('**compact-app**');
    expect(content).not.toContain('# compact-app');
  });

  it('agents-md target has Codex content', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), {
      name: 'agent-app',
    });

    const { collectProjectFacts, inferProjectMeta, buildAllSections, renderSections } = await importModules();

    const facts = await collectProjectFacts(tmpDir);
    const meta = inferProjectMeta(facts);
    const sections = buildAllSections(meta, 'agents-md', 'inline', { includeSkills: false, withMcp: false });
    const content = renderSections(sections);

    expect(content).toContain('Codex');
    expect(content).not.toContain('Claude Code');
  });

  it('section filter only generates one section', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), {
      name: 'filter-app',
      scripts: { build: 'tsc' },
    });
    await fs.ensureDir(path.join(tmpDir, 'src'));

    const { collectProjectFacts, inferProjectMeta, buildAllSections, renderSections } = await importModules();

    const facts = await collectProjectFacts(tmpDir);
    const meta = inferProjectMeta(facts);
    const sections = buildAllSections(meta, 'claude-md', 'inline', { includeSkills: false, withMcp: false }, 'commands');
    const content = renderSections(sections);

    expect(content).toContain('<!-- sm:begin commands -->');
    expect(content).not.toContain('<!-- sm:begin identity -->');
  });

  it('hasManagedBlocks detects generated content', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), { name: 'test' });

    const { collectProjectFacts, inferProjectMeta, buildAllSections, renderSections, hasManagedBlocks } = await importModules();

    const facts = await collectProjectFacts(tmpDir);
    const meta = inferProjectMeta(facts);
    const sections = buildAllSections(meta, 'claude-md', 'inline', { includeSkills: false, withMcp: false });
    const content = renderSections(sections);

    expect(hasManagedBlocks(content)).toBe(true);
    expect(hasManagedBlocks('# Plain readme')).toBe(false);
  });
});

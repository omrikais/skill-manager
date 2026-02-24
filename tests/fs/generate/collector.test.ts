import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { ProjectFacts } from '../../../src/core/generate/types.js';

let tmpDir: string;
let collectProjectFacts: (root: string) => Promise<ProjectFacts>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-gen-collect-'));

  // Dynamic import to avoid caching
  const mod = await import('../../../src/core/generate/collector.js');
  collectProjectFacts = mod.collectProjectFacts;
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('collectProjectFacts', () => {
  it('reads package.json', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), {
      name: 'test-pkg',
      description: 'A test package',
      type: 'module',
      scripts: { build: 'tsc', test: 'vitest' },
      dependencies: { react: '^18' },
    });

    const facts = await collectProjectFacts(tmpDir);
    expect(facts.packageJson).not.toBeNull();
    expect(facts.packageJson!.name).toBe('test-pkg');
    expect(facts.packageJson!.type).toBe('module');
    expect(facts.packageJson!.scripts).toEqual({ build: 'tsc', test: 'vitest' });
  });

  it('handles missing package.json', async () => {
    const facts = await collectProjectFacts(tmpDir);
    expect(facts.packageJson).toBeNull();
  });

  it('reads tsconfig.json', async () => {
    await fs.writeJson(path.join(tmpDir, 'tsconfig.json'), {
      compilerOptions: { strict: true, module: 'nodenext' },
    });

    const facts = await collectProjectFacts(tmpDir);
    expect(facts.tsconfig).not.toBeNull();
    expect(facts.tsconfig!.compilerOptions!.strict).toBe(true);
  });

  it('detects lockfile type', async () => {
    await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9');

    const facts = await collectProjectFacts(tmpDir);
    expect(facts.lockfileType).toBe('pnpm');
  });

  it('reads README head', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
    await fs.writeFile(path.join(tmpDir, 'README.md'), lines.join('\n'));

    const facts = await collectProjectFacts(tmpDir);
    expect(facts.readmeHead).not.toBeNull();
    expect(facts.readmeHead).toHaveLength(20);
    expect(facts.readmeHead![0]).toBe('Line 1');
  });

  it('reads existing CLAUDE.md', async () => {
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# Project\nExisting content');

    const facts = await collectProjectFacts(tmpDir);
    expect(facts.existingClaudeMd).toBe('# Project\nExisting content');
  });

  it('reads existing AGENTS.md', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Agents\nContent');

    const facts = await collectProjectFacts(tmpDir);
    expect(facts.existingAgentsMd).toBe('# Agents\nContent');
  });

  it('detects presence flags', async () => {
    await fs.ensureDir(path.join(tmpDir, '.github', 'workflows'));
    await fs.writeFile(path.join(tmpDir, 'Dockerfile'), 'FROM node:20');
    await fs.writeFile(path.join(tmpDir, '.eslintrc.json'), '{}');
    await fs.writeFile(path.join(tmpDir, '.env.example'), 'FOO=bar');
    await fs.ensureDir(path.join(tmpDir, '.husky'));

    const facts = await collectProjectFacts(tmpDir);
    expect(facts.presenceFlags.dockerfile).toBe(true);
    expect(facts.presenceFlags.githubWorkflows).toBe(true);
    expect(facts.presenceFlags.eslint).toBe(true);
    expect(facts.presenceFlags.envExample).toBe(true);
    expect(facts.presenceFlags.husky).toBe(true);
    expect(facts.presenceFlags.vitest).toBe(false);
    expect(facts.presenceFlags.prettier).toBe(false);
  });

  it('detects files and dirs via signals', async () => {
    await fs.ensureDir(path.join(tmpDir, 'src'));
    await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export {}');
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{}');

    const facts = await collectProjectFacts(tmpDir);
    expect(facts.files).toContain('src/index.ts');
    expect(facts.dirs).toContain('src');
    expect(facts.languages).toContain('typescript');
  });

  it('returns projectRoot', async () => {
    const facts = await collectProjectFacts(tmpDir);
    expect(facts.projectRoot).toBe(tmpDir);
  });
});

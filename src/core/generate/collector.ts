import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { scanProjectSignals } from '../triggers.js';
import type { ProjectFacts, PackageJson, TsConfig, LockfileType, GitInfo } from './types.js';

/**
 * Collect raw project facts from the filesystem. Zero inference — just reads.
 */
export async function collectProjectFacts(projectRoot: string): Promise<ProjectFacts> {
  const [
    packageJson,
    tsconfig,
    lockfileType,
    readmeHead,
    existingClaudeMd,
    existingAgentsMd,
    git,
    signals,
    presenceFlags,
  ] = await Promise.all([
    readJsonFile<PackageJson>(path.join(projectRoot, 'package.json')),
    readJsonFile<TsConfig>(path.join(projectRoot, 'tsconfig.json')),
    detectLockfile(projectRoot),
    readFileHead(path.join(projectRoot, 'README.md'), 20),
    readTextFile(path.join(projectRoot, 'CLAUDE.md')),
    readTextFile(path.join(projectRoot, 'AGENTS.md')),
    collectGitInfo(projectRoot),
    scanProjectSignals(projectRoot),
    detectPresenceFlags(projectRoot),
  ]);

  return {
    projectRoot,
    packageJson,
    tsconfig,
    lockfileType,
    readmeHead,
    existingClaudeMd,
    existingAgentsMd,
    git,
    files: signals.files,
    dirs: signals.dirs,
    languages: signals.languages,
    presenceFlags,
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function readFileHead(filePath: string, lines: number): Promise<string[] | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw.split('\n').slice(0, lines);
  } catch {
    return null;
  }
}

async function detectLockfile(projectRoot: string): Promise<LockfileType | null> {
  // Check in priority order
  if (await fs.pathExists(path.join(projectRoot, 'bun.lockb'))) return 'bun';
  if (await fs.pathExists(path.join(projectRoot, 'bun.lock'))) return 'bun';
  if (await fs.pathExists(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fs.pathExists(path.join(projectRoot, 'yarn.lock'))) return 'yarn';
  if (await fs.pathExists(path.join(projectRoot, 'package-lock.json'))) return 'npm';
  return null;
}

function collectGitInfo(projectRoot: string): GitInfo | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const branch = execSync('git branch --show-current', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return { remoteUrl: remoteUrl || undefined, branch: branch || undefined };
  } catch {
    return null;
  }
}

async function detectPresenceFlags(projectRoot: string): Promise<ProjectFacts['presenceFlags']> {
  const check = (p: string) => fs.pathExists(path.join(projectRoot, p));

  const [
    dockerfile,
    githubWorkflows,
    makefile,
    eslintRc,
    eslintConfig,
    eslintFlat,
    prettierRc,
    prettierConfig,
    vitestConfig,
    vitestConfigTs,
    jestConfig,
    jestConfigTs,
    jestConfigJs,
    husky,
    envExample,
    turbo,
    nx,
    lerna,
  ] = await Promise.all([
    check('Dockerfile'),
    check('.github/workflows'),
    check('Makefile'),
    check('.eslintrc'),
    check('.eslintrc.json'),
    check('eslint.config.js'),
    check('.prettierrc'),
    check('.prettierrc.json'),
    check('vitest.config.ts'),
    check('vitest.config.js'),
    check('jest.config.js'),
    check('jest.config.ts'),
    check('jest.config.json'),
    check('.husky'),
    check('.env.example'),
    check('turbo.json'),
    check('nx.json'),
    check('lerna.json'),
  ]);

  return {
    dockerfile,
    githubWorkflows,
    makefile,
    eslint: eslintRc || eslintConfig || eslintFlat,
    prettier: prettierRc || prettierConfig,
    vitest: vitestConfig || vitestConfigTs,
    jest: jestConfig || jestConfigTs || jestConfigJs,
    husky,
    envExample,
    turbo,
    nx,
    lerna,
  };
}

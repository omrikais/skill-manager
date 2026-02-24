import { describe, it, expect } from 'vitest';
import { inferProjectMeta } from '../../../src/core/generate/heuristics.js';
import type { ProjectFacts, GenerateConfig } from '../../../src/core/generate/types.js';

function makeFacts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    projectRoot: '/test/project',
    packageJson: null,
    tsconfig: null,
    lockfileType: null,
    readmeHead: null,
    existingClaudeMd: null,
    existingAgentsMd: null,
    git: null,
    files: [],
    dirs: [],
    languages: [],
    presenceFlags: {
      dockerfile: false,
      githubWorkflows: false,
      makefile: false,
      eslint: false,
      prettier: false,
      vitest: false,
      jest: false,
      husky: false,
      envExample: false,
      turbo: false,
      nx: false,
      lerna: false,
    },
    ...overrides,
  };
}

describe('inferProjectMeta', () => {
  describe('projectName', () => {
    it('uses package.json name', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: { name: 'my-app' },
      }));
      expect(meta.projectName).toBe('my-app');
    });

    it('falls back to directory name', () => {
      const meta = inferProjectMeta(makeFacts());
      expect(meta.projectName).toBe('project');
    });

    it('prefers config override', () => {
      const config: GenerateConfig = { identity: { name: 'Custom Name' } };
      const meta = inferProjectMeta(makeFacts({ packageJson: { name: 'pkg' } }), config);
      expect(meta.projectName).toBe('Custom Name');
    });
  });

  describe('oneLiner', () => {
    it('uses package.json description', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: { description: 'A cool tool' },
      }));
      expect(meta.oneLiner).toBe('A cool tool');
    });

    it('extracts from README non-heading line', () => {
      const meta = inferProjectMeta(makeFacts({
        readmeHead: ['# Title', '', 'This is the description.', 'More text.'],
      }));
      expect(meta.oneLiner).toBe('This is the description.');
    });

    it('skips badge lines in README', () => {
      const meta = inferProjectMeta(makeFacts({
        readmeHead: ['# Title', '![badge](url)', 'Real description here.'],
      }));
      expect(meta.oneLiner).toBe('Real description here.');
    });

    it('returns null when nothing found', () => {
      const meta = inferProjectMeta(makeFacts());
      expect(meta.oneLiner).toBeNull();
    });
  });

  describe('stack', () => {
    it('detects languages', () => {
      const meta = inferProjectMeta(makeFacts({
        languages: ['typescript', 'python'],
      }));
      expect(meta.stack).toContain('TypeScript');
      expect(meta.stack).toContain('Python');
    });

    it('detects dependencies', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: {
          dependencies: { react: '^18', express: '^4' },
        },
      }));
      expect(meta.stack).toContain('React');
      expect(meta.stack).toContain('Express');
    });

    it('includes devDependencies', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: {
          devDependencies: { vitest: '^1', tsup: '^8' },
        },
      }));
      expect(meta.stack).toContain('tsup');
    });
  });

  describe('packageManager', () => {
    it('detects from lockfile', () => {
      expect(inferProjectMeta(makeFacts({ lockfileType: 'bun' })).packageManager).toBe('bun');
      expect(inferProjectMeta(makeFacts({ lockfileType: 'pnpm' })).packageManager).toBe('pnpm');
      expect(inferProjectMeta(makeFacts({ lockfileType: 'yarn' })).packageManager).toBe('yarn');
      expect(inferProjectMeta(makeFacts({ lockfileType: 'npm' })).packageManager).toBe('npm');
    });

    it('defaults to npm if package.json exists', () => {
      const meta = inferProjectMeta(makeFacts({ packageJson: {} }));
      expect(meta.packageManager).toBe('npm');
    });

    it('returns null without package.json', () => {
      const meta = inferProjectMeta(makeFacts());
      expect(meta.packageManager).toBeNull();
    });
  });

  describe('isEsm', () => {
    it('true when type is module', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: { type: 'module' },
      }));
      expect(meta.isEsm).toBe(true);
    });

    it('false otherwise', () => {
      const meta = inferProjectMeta(makeFacts({ packageJson: {} }));
      expect(meta.isEsm).toBe(false);
    });
  });

  describe('commands', () => {
    it('maps scripts with package manager prefix', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: { scripts: { build: 'tsc', test: 'vitest' } },
        lockfileType: 'pnpm',
      }));
      const buildCmd = meta.commands.find((c) => c.name === 'build');
      expect(buildCmd?.command).toBe('pnpm build');
    });

    it('uses npm run prefix for npm', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: { scripts: { build: 'tsc' } },
        lockfileType: 'npm',
      }));
      const buildCmd = meta.commands.find((c) => c.name === 'build');
      expect(buildCmd?.command).toBe('npm run build');
    });

    it('applies config command overrides', () => {
      const config: GenerateConfig = { commands: { build: 'make build' } };
      const meta = inferProjectMeta(
        makeFacts({ packageJson: { scripts: { build: 'tsc' } } }),
        config,
      );
      const buildCmd = meta.commands.find((c) => c.name === 'build');
      expect(buildCmd?.command).toBe('make build');
    });

    it('adds config extras', () => {
      const config: GenerateConfig = { commands: { extras: { deploy: 'make deploy' } } };
      const meta = inferProjectMeta(makeFacts({ packageJson: { scripts: {} } }), config);
      const deployCmd = meta.commands.find((c) => c.name === 'deploy');
      expect(deployCmd?.command).toBe('make deploy');
    });

    it('sorts by priority', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: {
          scripts: { lint: 'eslint', build: 'tsc', test: 'vitest', dev: 'vite' },
        },
      }));
      const names = meta.commands.map((c) => c.name);
      expect(names.indexOf('build')).toBeLessThan(names.indexOf('test'));
      expect(names.indexOf('dev')).toBeLessThan(names.indexOf('lint'));
    });
  });

  describe('architecture', () => {
    it('maps known dirs', () => {
      const meta = inferProjectMeta(makeFacts({
        dirs: ['src', 'tests', 'docs'],
      }));
      expect(meta.architecture).toContainEqual({ path: 'src/', purpose: 'Source code' });
      expect(meta.architecture).toContainEqual({ path: 'tests/', purpose: 'Tests' });
    });

    it('skips hidden dirs', () => {
      const meta = inferProjectMeta(makeFacts({
        dirs: ['.github', 'src'],
      }));
      expect(meta.architecture.find((a) => a.path === '.github/')).toBeUndefined();
    });

    it('excludes dirs from config', () => {
      const config: GenerateConfig = { architecture: { exclude: ['scripts'] } };
      const meta = inferProjectMeta(makeFacts({ dirs: ['src', 'scripts'] }), config);
      expect(meta.architecture.find((a) => a.path === 'scripts/')).toBeUndefined();
    });

    it('adds src subdirs', () => {
      const meta = inferProjectMeta(makeFacts({
        dirs: ['src', 'src/core', 'src/utils'],
      }));
      expect(meta.architecture).toContainEqual({ path: 'src/core/', purpose: 'Core business logic' });
      expect(meta.architecture).toContainEqual({ path: 'src/utils/', purpose: 'Utility functions' });
    });
  });

  describe('conventions', () => {
    it('detects ESM', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: { type: 'module' },
      }));
      expect(meta.conventions).toContain('ESM-only (`"type": "module"`)');
    });

    it('detects strict mode', () => {
      const meta = inferProjectMeta(makeFacts({
        tsconfig: { compilerOptions: { strict: true } },
      }));
      expect(meta.conventions).toContain('TypeScript strict mode enabled');
    });

    it('detects eslint/prettier', () => {
      const meta = inferProjectMeta(makeFacts({
        presenceFlags: {
          ...makeFacts().presenceFlags,
          eslint: true,
          prettier: true,
        },
      }));
      expect(meta.conventions).toContain('ESLint for linting');
      expect(meta.conventions).toContain('Prettier for formatting');
    });

    it('appends config extras', () => {
      const config: GenerateConfig = { conventions: { extras: ['Use named exports'] } };
      const meta = inferProjectMeta(makeFacts(), config);
      expect(meta.conventions).toContain('Use named exports');
    });
  });

  describe('safetyRules', () => {
    it('warns about .env', () => {
      const meta = inferProjectMeta(makeFacts({
        presenceFlags: { ...makeFacts().presenceFlags, envExample: true },
      }));
      expect(meta.safetyRules.some((r) => r.includes('.env'))).toBe(true);
    });

    it('warns about lockfile', () => {
      const meta = inferProjectMeta(makeFacts({ lockfileType: 'yarn' }));
      expect(meta.safetyRules.some((r) => r.includes('yarn.lock'))).toBe(true);
    });

    it('warns about git hooks', () => {
      const meta = inferProjectMeta(makeFacts({
        presenceFlags: { ...makeFacts().presenceFlags, husky: true },
      }));
      expect(meta.safetyRules.some((r) => r.includes('--no-verify'))).toBe(true);
    });
  });

  describe('testInfo', () => {
    it('detects vitest', () => {
      const meta = inferProjectMeta(makeFacts({
        presenceFlags: { ...makeFacts().presenceFlags, vitest: true },
        files: ['vitest.config.ts'],
      }));
      expect(meta.testInfo.framework).toBe('Vitest');
      expect(meta.testInfo.configFile).toBe('vitest.config.ts');
    });

    it('detects jest', () => {
      const meta = inferProjectMeta(makeFacts({
        presenceFlags: { ...makeFacts().presenceFlags, jest: true },
      }));
      expect(meta.testInfo.framework).toBe('Jest');
    });

    it('detects test dirs', () => {
      const meta = inferProjectMeta(makeFacts({
        dirs: ['tests', 'e2e', 'src'],
      }));
      expect(meta.testInfo.dirs).toContain('tests');
      expect(meta.testInfo.dirs).toContain('e2e');
    });
  });

  describe('gotchas', () => {
    it('warns about ESM + TypeScript extensions', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: { type: 'module' },
        languages: ['typescript'],
      }));
      expect(meta.gotchas.some((g) => g.includes('`.js` extensions'))).toBe(true);
    });

    it('warns about monorepo', () => {
      const meta = inferProjectMeta(makeFacts({
        presenceFlags: { ...makeFacts().presenceFlags, turbo: true },
      }));
      expect(meta.gotchas.some((g) => g.includes('Monorepo'))).toBe(true);
    });

    it('notes Node.js version', () => {
      const meta = inferProjectMeta(makeFacts({
        packageJson: { engines: { node: '>=20' } },
      }));
      expect(meta.gotchas.some((g) => g.includes('Node.js >=20'))).toBe(true);
    });

    it('appends config extras', () => {
      const config: GenerateConfig = { gotchas: { extras: ['Custom warning'] } };
      const meta = inferProjectMeta(makeFacts(), config);
      expect(meta.gotchas).toContain('Custom warning');
    });
  });
});

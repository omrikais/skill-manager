import { describe, it, expect } from 'vitest';
import { buildSection, buildAllSections } from '../../../src/core/generate/sections.js';
import type { ProjectMeta, SectionBuildOptions } from '../../../src/core/generate/types.js';

function makeMeta(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    projectName: 'test-project',
    oneLiner: 'A test project',
    stack: ['TypeScript', 'React'],
    packageManager: 'npm',
    isEsm: true,
    commands: [
      { name: 'build', command: 'npm run build', description: 'Build the project' },
      { name: 'test', command: 'npm run test', description: 'Run tests' },
    ],
    architecture: [
      { path: 'src/', purpose: 'Source code' },
      { path: 'tests/', purpose: 'Tests' },
    ],
    conventions: ['ESM-only (`"type": "module"`)', 'TypeScript strict mode enabled'],
    safetyRules: ['Never commit `.env` files'],
    testInfo: { framework: 'Vitest', dirs: ['tests'], configFile: 'vitest.config.ts' },
    gotchas: ['ESM requires .js extensions'],
    ...overrides,
  };
}

const defaultOpts: SectionBuildOptions = { includeSkills: false, withMcp: false };

describe('buildSection', () => {
  describe('identity', () => {
    it('inline mode has heading and stack', () => {
      const section = buildSection('identity', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section).not.toBeNull();
      expect(section!.content).toContain('# test-project');
      expect(section!.content).toContain('TypeScript, React');
      expect(section!.content).toContain('npm');
    });

    it('summary mode is compact', () => {
      const section = buildSection('identity', makeMeta(), 'claude-md', 'summary', defaultOpts);
      expect(section!.content).toContain('**test-project**');
      expect(section!.content).not.toContain('# ');
    });

    it('shows TODO for missing oneLiner', () => {
      const meta = makeMeta({ oneLiner: null });
      const section = buildSection('identity', meta, 'claude-md', 'inline', defaultOpts);
      expect(section!.content).toContain('[TODO:');
    });
  });

  describe('commands', () => {
    it('inline mode renders a table', () => {
      const section = buildSection('commands', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section!.content).toContain('| Command |');
      expect(section!.content).toContain('npm run build');
    });

    it('summary mode renders a list', () => {
      const section = buildSection('commands', makeMeta(), 'claude-md', 'summary', defaultOpts);
      expect(section!.content).toContain('- `npm run build`');
    });

    it('reference mode mentions package.json', () => {
      const section = buildSection('commands', makeMeta(), 'claude-md', 'reference', defaultOpts);
      expect(section!.content).toContain('package.json');
    });

    it('returns null when no commands', () => {
      const section = buildSection('commands', makeMeta({ commands: [] }), 'claude-md', 'inline', defaultOpts);
      expect(section).toBeNull();
    });
  });

  describe('architecture', () => {
    it('inline mode renders code block', () => {
      const section = buildSection('architecture', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section!.content).toContain('```');
      expect(section!.content).toContain('src/');
    });

    it('summary mode renders list', () => {
      const section = buildSection('architecture', makeMeta(), 'claude-md', 'summary', defaultOpts);
      expect(section!.content).toContain('- `src/`');
    });

    it('returns null when no architecture', () => {
      const section = buildSection('architecture', makeMeta({ architecture: [] }), 'claude-md', 'inline', defaultOpts);
      expect(section).toBeNull();
    });
  });

  describe('conventions', () => {
    it('renders bullet list', () => {
      const section = buildSection('conventions', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section!.content).toContain('- ESM-only');
    });

    it('returns null when empty', () => {
      const section = buildSection('conventions', makeMeta({ conventions: [] }), 'claude-md', 'inline', defaultOpts);
      expect(section).toBeNull();
    });
  });

  describe('safety', () => {
    it('renders safety rules', () => {
      const section = buildSection('safety', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section!.content).toContain('.env');
    });

    it('returns null when empty', () => {
      const section = buildSection('safety', makeMeta({ safetyRules: [] }), 'claude-md', 'inline', defaultOpts);
      expect(section).toBeNull();
    });
  });

  describe('testing', () => {
    it('includes framework and dirs', () => {
      const section = buildSection('testing', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section!.content).toContain('Vitest');
      expect(section!.content).toContain('tests/');
    });

    it('inline mode includes checklist', () => {
      const section = buildSection('testing', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section!.content).toContain('Before submitting');
    });

    it('returns null when no test info', () => {
      const meta = makeMeta({ testInfo: { framework: null, dirs: [], configFile: null } });
      const section = buildSection('testing', meta, 'claude-md', 'inline', defaultOpts);
      expect(section).toBeNull();
    });
  });

  describe('gotchas', () => {
    it('renders warnings', () => {
      const section = buildSection('gotchas', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section!.content).toContain('.js extensions');
    });
  });

  describe('skills', () => {
    it('returns null when not enabled', () => {
      const section = buildSection('skills', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section).toBeNull();
    });

    it('renders skills when enabled', () => {
      const opts: SectionBuildOptions = {
        includeSkills: true,
        withMcp: false,
        skills: [
          { slug: 'test-skill', name: 'Test Skill', description: 'A test' },
        ],
      };
      const section = buildSection('skills', makeMeta(), 'claude-md', 'inline', opts);
      expect(section).not.toBeNull();
      expect(section!.content).toContain('Test Skill');
    });

    it('includes trigger info', () => {
      const opts: SectionBuildOptions = {
        includeSkills: true,
        withMcp: false,
        skills: [
          { slug: 'ts', name: 'TS', description: 'TypeScript', triggers: { files: ['tsconfig.json'] } },
        ],
      };
      const section = buildSection('skills', makeMeta(), 'claude-md', 'inline', opts);
      expect(section!.content).toContain('tsconfig.json');
    });
  });

  describe('mcp', () => {
    it('returns null when not enabled', () => {
      const section = buildSection('mcp', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section).toBeNull();
    });

    it('renders when enabled', () => {
      const opts: SectionBuildOptions = { includeSkills: false, withMcp: true };
      const section = buildSection('mcp', makeMeta(), 'claude-md', 'inline', opts);
      expect(section).not.toBeNull();
      expect(section!.content).toContain('MCP');
    });
  });

  describe('tool-specific', () => {
    it('claude-md target has Claude Code content', () => {
      const section = buildSection('tool-specific', makeMeta(), 'claude-md', 'inline', defaultOpts);
      expect(section!.content).toContain('Claude Code');
    });

    it('agents-md target has Codex content', () => {
      const section = buildSection('tool-specific', makeMeta(), 'agents-md', 'inline', defaultOpts);
      expect(section!.content).toContain('Codex');
    });
  });
});

describe('buildAllSections', () => {
  it('builds all non-null sections', () => {
    const sections = buildAllSections(makeMeta(), 'claude-md', 'inline', defaultOpts);
    expect(sections.length).toBeGreaterThan(0);
    const names = sections.map((s) => s.name);
    expect(names).toContain('identity');
    expect(names).toContain('commands');
    expect(names).not.toContain('skills'); // not enabled
    expect(names).not.toContain('mcp'); // not enabled
  });

  it('filters to single section', () => {
    const sections = buildAllSections(makeMeta(), 'claude-md', 'inline', defaultOpts, 'identity');
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('identity');
  });
});

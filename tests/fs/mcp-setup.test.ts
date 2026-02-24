import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
  vi.restoreAllMocks();
});

function mockChildProcess() {
  vi.mock('child_process', async (importOriginal) => {
    const orig = await importOriginal<typeof import('child_process')>();
    return {
      ...orig,
      execSync: vi.fn(() => {
        throw new Error('command not found');
      }),
      execFileSync: vi.fn(() => {
        throw new Error('command not found');
      }),
    };
  });
}

describe('MCP setup command', () => {
  it('completes setup for all tools', async () => {
    mockChildProcess();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const { mcpSetupCommand } = await import('../../src/mcp/setup.js');
      await mcpSetupCommand({ tool: 'all', scope: 'user' });

      const output = logs.join('\n');
      // Should mention sm-skills in success or fallback output
      expect(output).toContain('sm-skills');
    } finally {
      console.log = origLog;
    }
  });

  it('handles cc-only setup', async () => {
    mockChildProcess();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const { mcpSetupCommand } = await import('../../src/mcp/setup.js');
      await mcpSetupCommand({ tool: 'cc', scope: 'user' });

      const output = logs.join('\n');
      expect(output).toContain('sm-skills');
      // Should not mention codex config
      expect(output).not.toContain('config.toml');
      expect(output).not.toContain('Codex');
    } finally {
      console.log = origLog;
    }
  });

  it('handles codex-only setup', async () => {
    mockChildProcess();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const { mcpSetupCommand } = await import('../../src/mcp/setup.js');
      await mcpSetupCommand({ tool: 'codex', scope: 'user' });

      const output = logs.join('\n');
      expect(output).toContain('sm-skills');
      // Should not mention Claude Code
      expect(output).not.toContain('Claude Code');
      expect(output).not.toContain('mcpServers');
    } finally {
      console.log = origLog;
    }
  });

  it('treats "already exists" from claude mcp add as success', async () => {
    vi.doMock('child_process', async (importOriginal) => {
      const orig = await importOriginal<typeof import('child_process')>();
      return {
        ...orig,
        execSync: vi.fn((cmd: string) => {
          if (typeof cmd === 'string' && cmd.includes('which')) return '/usr/local/bin/sm';
          throw new Error('command not found');
        }),
        execFileSync: vi.fn(() => {
          throw new Error('MCP server sm-skills already exists in user config');
        }),
      };
    });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const { mcpSetupCommand } = await import('../../src/mcp/setup.js');
      const result = await mcpSetupCommand({ tool: 'cc', scope: 'user' });

      expect(result.succeeded).toContain('cc');
      expect(result.failed).not.toContain('cc');
      const output = logs.join('\n');
      expect(output).toContain('already configured');
    } finally {
      console.log = origLog;
    }
  });
});

describe('MCP uninstall command', () => {
  it('completes uninstall for all tools', async () => {
    mockChildProcess();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const { mcpUninstallCommand } = await import('../../src/mcp/setup.js');
      await mcpUninstallCommand({ tool: 'all', scope: 'user' });

      const output = logs.join('\n');
      expect(output).toContain('sm-skills');
    } finally {
      console.log = origLog;
    }
  });

  it('handles cc-only uninstall', async () => {
    mockChildProcess();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const { mcpUninstallCommand } = await import('../../src/mcp/setup.js');
      await mcpUninstallCommand({ tool: 'cc', scope: 'user' });

      const output = logs.join('\n');
      expect(output).toContain('sm-skills');
      expect(output).not.toContain('Codex');
    } finally {
      console.log = origLog;
    }
  });

  it('handles codex-only uninstall', async () => {
    mockChildProcess();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const { mcpUninstallCommand } = await import('../../src/mcp/setup.js');
      await mcpUninstallCommand({ tool: 'codex', scope: 'user' });

      const output = logs.join('\n');
      expect(output).toContain('sm-skills');
      expect(output).not.toContain('Claude Code');
    } finally {
      console.log = origLog;
    }
  });

  it('treats "not found" from claude mcp remove as success', async () => {
    vi.doMock('child_process', async (importOriginal) => {
      const orig = await importOriginal<typeof import('child_process')>();
      return {
        ...orig,
        execFileSync: vi.fn(() => {
          throw new Error('No user-scoped MCP server found with name: sm-skills');
        }),
      };
    });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const { mcpUninstallCommand } = await import('../../src/mcp/setup.js');
      const result = await mcpUninstallCommand({ tool: 'cc', scope: 'user' });

      expect(result.succeeded).toContain('cc');
      expect(result.failed).not.toContain('cc');
      const output = logs.join('\n');
      expect(output).toContain('already removed');
    } finally {
      console.log = origLog;
    }
  });
});

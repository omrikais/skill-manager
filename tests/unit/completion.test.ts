import { describe, it, expect } from 'vitest';
import { completionCommand } from '../../src/commands/completion.js';

describe('completionCommand', () => {
  it('bash output contains complete -F', () => {
    const script = completionCommand('bash');
    expect(script).toContain('complete -F');
    expect(script).toContain('_sm_completions');
  });

  it('bash output contains known subcommands', () => {
    const script = completionCommand('bash');
    expect(script).toContain('import');
    expect(script).toContain('add');
    expect(script).toContain('remove');
    expect(script).toContain('sync');
    expect(script).toContain('doctor');
    expect(script).toContain('profile');
    expect(script).toContain('completion');
  });

  it('zsh output starts with #compdef', () => {
    const script = completionCommand('zsh');
    expect(script).toMatch(/^#compdef sm/);
  });

  it('zsh output contains known subcommands', () => {
    const script = completionCommand('zsh');
    expect(script).toContain('import:');
    expect(script).toContain('add:');
    expect(script).toContain('sync:');
    expect(script).toContain('doctor:');
  });

  it('fish output contains complete -c sm', () => {
    const script = completionCommand('fish');
    expect(script).toContain('complete -c sm');
  });

  it('fish output contains known subcommands', () => {
    const script = completionCommand('fish');
    expect(script).toContain("'import'");
    expect(script).toContain("'add'");
    expect(script).toContain("'sync'");
    expect(script).toContain("'doctor'");
  });

  it('throws on unsupported shell', () => {
    expect(() => completionCommand('powershell' as 'bash')).toThrow('Unsupported shell');
  });

  it('bash skill-name branch guards against nested subcommands', () => {
    const script = completionCommand('bash');
    // The skill-name case should check topcmd to exclude source, pack, etc.
    expect(script).toContain('topcmd');
    expect(script).toMatch(/source\|pack\|profile\|hooks\|mcp\|generate/);
  });
});

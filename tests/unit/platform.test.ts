import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isMac, isLinux, getEditor, shellQuote, parseEditorCommand } from '../../src/utils/platform.js';

describe('isMac', () => {
  it('returns a boolean', () => {
    expect(typeof isMac()).toBe('boolean');
  });

  it('returns true on darwin', () => {
    // We're running on macOS in this test env
    if (process.platform === 'darwin') {
      expect(isMac()).toBe(true);
    }
  });
});

describe('isLinux', () => {
  it('returns a boolean', () => {
    expect(typeof isLinux()).toBe('boolean');
  });

  it('returns false on macOS', () => {
    if (process.platform === 'darwin') {
      expect(isLinux()).toBe(false);
    }
  });
});

describe('getEditor', () => {
  const origEditor = process.env.EDITOR;
  const origVisual = process.env.VISUAL;

  afterEach(() => {
    // Restore original env
    if (origEditor !== undefined) process.env.EDITOR = origEditor;
    else delete process.env.EDITOR;
    if (origVisual !== undefined) process.env.VISUAL = origVisual;
    else delete process.env.VISUAL;
  });

  it('returns EDITOR env var when set', () => {
    process.env.EDITOR = 'nano';
    delete process.env.VISUAL;
    expect(getEditor()).toBe('nano');
  });

  it('falls back to VISUAL when EDITOR is not set', () => {
    delete process.env.EDITOR;
    process.env.VISUAL = 'code';
    expect(getEditor()).toBe('code');
  });

  it('prefers EDITOR over VISUAL', () => {
    process.env.EDITOR = 'vim';
    process.env.VISUAL = 'code';
    expect(getEditor()).toBe('vim');
  });

  it('falls back to vi on non-Windows when neither env var is set', () => {
    delete process.env.EDITOR;
    delete process.env.VISUAL;
    if (process.platform !== 'win32') {
      expect(getEditor()).toBe('vi');
    }
  });

  it('returns a string', () => {
    expect(typeof getEditor()).toBe('string');
    expect(getEditor().length).toBeGreaterThan(0);
  });
});

describe('shellQuote', () => {
  it('wraps a simple path in single quotes on unix', () => {
    if (process.platform !== 'win32') {
      expect(shellQuote('/usr/bin/file')).toBe("'/usr/bin/file'");
    }
  });

  it('escapes single quotes inside the path on unix', () => {
    if (process.platform !== 'win32') {
      expect(shellQuote("/it's a file")).toBe("'/it'\\''s a file'");
    }
  });

  it('preserves spaces inside quotes', () => {
    if (process.platform !== 'win32') {
      expect(shellQuote('/path/with spaces/file.md')).toBe("'/path/with spaces/file.md'");
    }
  });
});

describe('parseEditorCommand', () => {
  it('parses a simple editor name', () => {
    expect(parseEditorCommand('vim')).toEqual(['vim']);
  });

  it('parses editor with arguments', () => {
    expect(parseEditorCommand('code --wait')).toEqual(['code', '--wait']);
  });

  it('parses editor with multiple arguments', () => {
    expect(parseEditorCommand('subl -w --new-window')).toEqual(['subl', '-w', '--new-window']);
  });

  it('parses a full path editor', () => {
    expect(parseEditorCommand('/usr/local/bin/nvim')).toEqual(['/usr/local/bin/nvim']);
  });

  it('trims surrounding whitespace', () => {
    expect(parseEditorCommand('  nano  ')).toEqual(['nano']);
  });

  it('handles double-quoted path with spaces', () => {
    expect(parseEditorCommand('"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --wait')).toEqual([
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      '--wait',
    ]);
  });

  it('handles single-quoted path with spaces', () => {
    expect(parseEditorCommand("'/usr/local/my editor/bin/edit' -w")).toEqual([
      '/usr/local/my editor/bin/edit',
      '-w',
    ]);
  });

  it('handles quoted arguments', () => {
    expect(parseEditorCommand('nvim -c "set ft=markdown"')).toEqual([
      'nvim',
      '-c',
      'set ft=markdown',
    ]);
  });

  it('handles backslash-escaped spaces in unquoted tokens (Unix only)', () => {
    if (process.platform === 'win32') return; // On Windows, backslashes are literal path separators
    expect(parseEditorCommand('my\\ editor --wait')).toEqual([
      'my editor',
      '--wait',
    ]);
  });

  it('preserves unquoted backslashes on Windows', () => {
    if (process.platform !== 'win32') return; // Only relevant on Windows
    expect(parseEditorCommand('C:\\Tools\\nvim\\nvim.exe --wait')).toEqual([
      'C:\\Tools\\nvim\\nvim.exe',
      '--wait',
    ]);
  });

  it('handles backslash escapes inside double quotes', () => {
    expect(parseEditorCommand('"path\\"with\\"quotes" --flag')).toEqual([
      'path"with"quotes',
      '--flag',
    ]);
  });

  it('preserves backslashes in Windows paths inside double quotes', () => {
    expect(parseEditorCommand('"C:\\Program Files\\nvim\\nvim.exe" --wait')).toEqual([
      'C:\\Program Files\\nvim\\nvim.exe',
      '--wait',
    ]);
  });

  it('preserves literal backslashes before non-special chars in double quotes', () => {
    expect(parseEditorCommand('"C:\\Users\\me\\editor" -w')).toEqual([
      'C:\\Users\\me\\editor',
      '-w',
    ]);
  });
});

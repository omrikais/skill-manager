import os from 'os';

export function isMac(): boolean {
  return os.platform() === 'darwin';
}

export function isLinux(): boolean {
  return os.platform() === 'linux';
}

export function isWindows(): boolean {
  return os.platform() === 'win32';
}

export function getEditor(): string {
  return process.env.EDITOR || process.env.VISUAL || (process.platform === 'win32' ? 'notepad' : 'vi');
}

export function shellQuote(s: string): string {
  if (process.platform === 'win32') return `"${s.replace(/"/g, '\\"')}"`;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Parse an editor string (e.g. from $EDITOR) into a command and arguments array
 * suitable for use with `execFileSync(cmd, [...args, file])`.
 *
 * Respects shell quoting so that values like
 * `"/Applications/Visual Studio Code.app/.../code" --wait` and
 * `nvim -c "set ft=markdown"` are tokenized correctly.
 */
export function parseEditorCommand(editor: string): [cmd: string, ...args: string[]] {
  const tokens: string[] = [];
  let current = '';
  let i = 0;
  const s = editor.trim();

  while (i < s.length) {
    const ch = s[i];

    if (ch === '"') {
      // Double-quoted segment: collect until closing quote.
      // \" always escapes a literal quote. \\ escapes to a single \ on Unix only;
      // on Windows backslashes are literal path separators (preserves UNC paths like \\server\...).
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length
          && (s[i + 1] === '"' || (s[i + 1] === '\\' && process.platform !== 'win32'))) {
          i++;
        }
        current += s[i];
        i++;
      }
      i++; // skip closing quote
    } else if (ch === "'") {
      // Single-quoted segment: collect until closing quote (literal, no escapes)
      i++;
      while (i < s.length && s[i] !== "'") {
        current += s[i];
        i++;
      }
      i++; // skip closing quote
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      i++;
    } else {
      // Unquoted: on Unix, backslash escapes the next char (e.g. `my\ editor`).
      // On Windows, backslash is a path separator and must stay literal.
      if (ch === '\\' && i + 1 < s.length && process.platform !== 'win32') {
        i++;
        current += s[i];
      } else {
        current += ch;
      }
      i++;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  if (tokens.length === 0) {
    return [editor.trim()];
  }

  return tokens as [string, ...string[]];
}

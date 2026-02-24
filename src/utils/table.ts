import chalk from 'chalk';

export interface Column {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  format?: (value: unknown) => string;
}

export function formatTable(rows: Record<string, unknown>[], columns: Column[]): string {
  // Calculate column widths
  const widths = columns.map((col) => {
    const headerLen = col.header.length;
    const maxDataLen = rows.reduce((max, row) => {
      const val = col.format ? col.format(row[col.key]) : String(row[col.key] ?? '');
      return Math.max(max, stripAnsi(val).length);
    }, 0);
    return col.width ?? Math.max(headerLen, maxDataLen);
  });

  // Header
  const header = columns
    .map((col, i) => chalk.bold(pad(col.header, widths[i], col.align)))
    .join('  ');

  const separator = widths.map((w) => '─'.repeat(w)).join('──');

  // Rows
  const body = rows.map((row) =>
    columns
      .map((col, i) => {
        const val = col.format ? col.format(row[col.key]) : String(row[col.key] ?? '');
        return pad(val, widths[i], col.align);
      })
      .join('  ')
  );

  return [header, separator, ...body].join('\n');
}

function pad(str: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const len = stripAnsi(str).length;
  const diff = Math.max(0, width - len);
  switch (align) {
    case 'right':
      return ' '.repeat(diff) + str;
    case 'center': {
      const left = Math.floor(diff / 2);
      return ' '.repeat(left) + str + ' '.repeat(diff - left);
    }
    default:
      return str + ' '.repeat(diff);
  }
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

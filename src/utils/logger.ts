import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let currentLevel: LogLevel = 'info';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[currentLevel];
}

export const log = {
  debug(...args: unknown[]): void {
    if (shouldLog('debug')) console.error(chalk.gray('[debug]'), ...args);
  },
  info(...args: unknown[]): void {
    if (shouldLog('info')) console.error(chalk.blue('ℹ'), ...args);
  },
  success(...args: unknown[]): void {
    if (shouldLog('info')) console.error(chalk.green('✓'), ...args);
  },
  warn(...args: unknown[]): void {
    if (shouldLog('warn')) console.error(chalk.yellow('⚠'), ...args);
  },
  error(...args: unknown[]): void {
    if (shouldLog('error')) console.error(chalk.red('✗'), ...args);
  },
};

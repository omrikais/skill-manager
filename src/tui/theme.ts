export type ThemeMode = 'dark' | 'light' | 'ansi';

export interface ThemeColors {
  primary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
  text: string;
  dim: string;
  border: string;
  cc: string;
  codex: string;
}

export const darkColors: ThemeColors = {
  primary: '#818CF8',
  accent: '#A5B4FC',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  muted: '#D1D5DB',
  text: '#F3F4F6',
  dim: '#9CA3AF',
  border: '#748091',
  cc: '#A78BFA',
  codex: '#2DD4BF',
};

export const lightColors: ThemeColors = {
  primary: '#3730A3',
  accent: '#4338CA',
  success: '#065F46',
  warning: '#92400E',
  error: '#991B1B',
  muted: '#374151',
  text: '#111827',
  dim: '#4B5563',
  border: '#6B7280',
  cc: '#5B21B6',
  codex: '#0F766E',
};

export const ansiColors: ThemeColors = {
  primary: 'blueBright',
  accent: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  muted: 'white',
  text: 'whiteBright',
  dim: 'gray',
  border: 'gray',
  cc: 'magentaBright',
  codex: 'cyanBright',
};

/**
 * Resolve the active theme mode.
 * 1. If `SM_TUI_THEME` is set to a valid mode, use it.
 * 2. Else inspect `COLORFGBG`; if the last token is `7` or `15`, use `light`.
 * 3. Default to `dark`.
 */
export function resolveThemeMode(env: Record<string, string | undefined> = process.env): ThemeMode {
  const override = env.SM_TUI_THEME;
  if (override === 'dark' || override === 'light' || override === 'ansi') {
    return override;
  }
  const colorfgbg = env.COLORFGBG;
  if (colorfgbg) {
    const parts = colorfgbg.split(';');
    const last = parts[parts.length - 1]?.trim();
    if (last === '7' || last === '15') return 'light';
  }
  return 'dark';
}

/** Return the color palette for a given theme mode. */
export function getThemeColors(mode: ThemeMode): ThemeColors {
  switch (mode) {
    case 'light':
      return lightColors;
    case 'ansi':
      return ansiColors;
    default:
      return darkColors;
  }
}

/** Resolved palette — used by all TUI components. */
export const colors: ThemeColors = getThemeColors(resolveThemeMode());

export const symbols = {
  deployed: '\u25CF', // ●
  notDeployed: '\u25CB', // ○
  healthy: '\u2713', // ✓
  broken: '\u2717', // ✗
  warning: '!',
  arrow: '\u203A', // ›
  separator: '\u2502', // │
  selected: '\u25B8', // ▸
  dot: '\u00B7', // ·
};

export type ScreenName = 'dashboard' | 'browser' | 'detail' | 'import' | 'profiles' | 'sync' | 'sources' | 'generate';

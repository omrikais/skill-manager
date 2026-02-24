import { describe, it, expect } from 'vitest';
import { darkColors, lightColors, resolveThemeMode, getThemeColors } from '../../../src/tui/theme.js';

/**
 * Compute relative luminance of a hex color per WCAG 2.0.
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two hex colors. */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const contrastKeys = ['text', 'muted', 'dim', 'border', 'primary'] as const;

describe('theme', () => {
  describe('dark palette WCAG contrast on black (#000000)', () => {
    for (const key of contrastKeys) {
      it(`${key} has contrast >= 4.5 on black`, () => {
        const ratio = contrastRatio(darkColors[key], '#000000');
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  describe('light palette WCAG contrast on white (#FFFFFF)', () => {
    for (const key of contrastKeys) {
      it(`${key} has contrast >= 4.5 on white`, () => {
        const ratio = contrastRatio(lightColors[key], '#FFFFFF');
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  describe('resolveThemeMode', () => {
    it('uses SM_TUI_THEME when set to dark', () => {
      expect(resolveThemeMode({ SM_TUI_THEME: 'dark' })).toBe('dark');
    });

    it('uses SM_TUI_THEME when set to light', () => {
      expect(resolveThemeMode({ SM_TUI_THEME: 'light' })).toBe('light');
    });

    it('uses SM_TUI_THEME when set to ansi', () => {
      expect(resolveThemeMode({ SM_TUI_THEME: 'ansi' })).toBe('ansi');
    });

    it('ignores invalid SM_TUI_THEME values', () => {
      expect(resolveThemeMode({ SM_TUI_THEME: 'neon' })).toBe('dark');
    });

    it('SM_TUI_THEME takes precedence over COLORFGBG', () => {
      expect(resolveThemeMode({ SM_TUI_THEME: 'ansi', COLORFGBG: '0;15' })).toBe('ansi');
    });

    it('falls back to COLORFGBG=0;15 as light', () => {
      expect(resolveThemeMode({ COLORFGBG: '0;15' })).toBe('light');
    });

    it('falls back to COLORFGBG=0;7 as light', () => {
      expect(resolveThemeMode({ COLORFGBG: '0;7' })).toBe('light');
    });

    it('treats COLORFGBG=15;0 as dark', () => {
      expect(resolveThemeMode({ COLORFGBG: '15;0' })).toBe('dark');
    });

    it('defaults to dark when no env vars set', () => {
      expect(resolveThemeMode({})).toBe('dark');
    });
  });

  describe('getThemeColors', () => {
    it('returns darkColors for dark mode', () => {
      expect(getThemeColors('dark')).toBe(darkColors);
    });

    it('returns lightColors for light mode', () => {
      expect(getThemeColors('light')).toBe(lightColors);
    });

    it('returns ansiColors for ansi mode', () => {
      const ansi = getThemeColors('ansi');
      expect(ansi.primary).toBe('blueBright');
    });
  });
});

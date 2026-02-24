import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../../src/utils/version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '../../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

describe('VERSION', () => {
  it('matches package.json version', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('is a valid semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('is a non-empty string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });
});

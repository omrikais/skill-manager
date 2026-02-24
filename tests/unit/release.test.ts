import { describe, it, expect } from 'vitest';

// Import pure functions from the release script
const { parseSemver, bumpVersion, resolveVersion } = await import('../../scripts/release.mjs');

describe('parseSemver', () => {
  it('parses a valid semver string', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
  });

  it('parses 0.0.0', () => {
    expect(parseSemver('0.0.0')).toEqual([0, 0, 0]);
  });

  it('returns null for non-semver strings', () => {
    expect(parseSemver('abc')).toBeNull();
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('1.2.3.4')).toBeNull();
    expect(parseSemver('')).toBeNull();
  });

  it('returns null for pre-release suffixes', () => {
    // parseSemver only handles strict major.minor.patch
    expect(parseSemver('1.2.3-beta.1')).toBeNull();
  });
});

describe('bumpVersion', () => {
  it('bumps patch', () => {
    expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
    expect(bumpVersion('0.0.9', 'patch')).toBe('0.0.10');
  });

  it('bumps minor and resets patch', () => {
    expect(bumpVersion('1.0.0', 'minor')).toBe('1.1.0');
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  it('bumps major and resets minor and patch', () => {
    expect(bumpVersion('1.0.0', 'major')).toBe('2.0.0');
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('throws on invalid current version', () => {
    expect(() => bumpVersion('invalid', 'patch')).toThrow('Invalid current version');
  });

  it('throws on invalid bump type', () => {
    expect(() => bumpVersion('1.0.0', 'prerelease')).toThrow('Invalid bump type');
  });
});

describe('resolveVersion', () => {
  it('resolves bump types', () => {
    expect(resolveVersion('1.0.0', 'patch')).toBe('1.0.1');
    expect(resolveVersion('1.0.0', 'minor')).toBe('1.1.0');
    expect(resolveVersion('1.0.0', 'major')).toBe('2.0.0');
  });

  it('passes through explicit version strings', () => {
    expect(resolveVersion('1.0.0', '2.0.0')).toBe('2.0.0');
    expect(resolveVersion('1.0.0', '2.0.0-beta.1')).toBe('2.0.0-beta.1');
    expect(resolveVersion('1.0.0', '1.0.0-rc.2+build.123')).toBe('1.0.0-rc.2+build.123');
    expect(resolveVersion('1.0.0', '3.0.0+sha.abc')).toBe('3.0.0+sha.abc');
  });

  it('accepts hyphenated prerelease and build identifiers', () => {
    expect(resolveVersion('1.0.0', '1.2.3-alpha-beta')).toBe('1.2.3-alpha-beta');
    expect(resolveVersion('1.0.0', '1.0.0+build-42')).toBe('1.0.0+build-42');
    expect(resolveVersion('1.0.0', '2.0.0-rc-1.test-2+build-3')).toBe('2.0.0-rc-1.test-2+build-3');
  });

  it('accepts digit-starting alphanumeric prerelease identifiers', () => {
    expect(resolveVersion('1.0.0', '1.0.0-0a')).toBe('1.0.0-0a');
    expect(resolveVersion('1.0.0', '1.0.0-1beta')).toBe('1.0.0-1beta');
    expect(resolveVersion('1.0.0', '1.0.0-1.0a')).toBe('1.0.0-1.0a');
  });

  it('rejects trailing garbage after version', () => {
    expect(() => resolveVersion('1.0.0', '1.2.3foo')).toThrow('Invalid version argument');
    expect(() => resolveVersion('1.0.0', '1.2.3 extra')).toThrow('Invalid version argument');
    expect(() => resolveVersion('1.0.0', '1.2.3.4')).toThrow('Invalid version argument');
  });

  it('rejects leading zeros in version parts', () => {
    expect(() => resolveVersion('1.0.0', '01.0.0')).toThrow('Invalid version argument');
    expect(() => resolveVersion('1.0.0', '1.02.0')).toThrow('Invalid version argument');
    expect(() => resolveVersion('1.0.0', '1.0.03')).toThrow('Invalid version argument');
  });

  it('rejects leading zeros in numeric prerelease identifiers', () => {
    expect(() => resolveVersion('1.0.0', '1.0.0-01')).toThrow('Invalid version argument');
  });

  it('throws on invalid input', () => {
    expect(() => resolveVersion('1.0.0', 'foo')).toThrow('Invalid version argument');
    expect(() => resolveVersion('1.0.0', '')).toThrow('Invalid version argument');
  });
});

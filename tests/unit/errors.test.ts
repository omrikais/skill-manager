import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SmError,
  SkillNotFoundError,
  SkillExistsError,
  LinkError,
  ConfigError,
  ManifestError,
  InvalidSlugError,
  UsageError,
  CyclicDependencyError,
  SourceError,
  SourceNotFoundError,
  PackNotFoundError,
  GenerateError,
  validateSlug,
  withErrorHandler,
} from '../../src/utils/errors.js';

describe('error classes', () => {
  it('SmError has correct code and message', () => {
    const err = new SmError('something broke', 'TEST_CODE');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('SmError');
    expect(err).toBeInstanceOf(Error);
  });

  it('SkillNotFoundError has SKILL_NOT_FOUND code', () => {
    const err = new SkillNotFoundError('my-skill');
    expect(err.code).toBe('SKILL_NOT_FOUND');
    expect(err.message).toBe('Skill not found: my-skill');
    expect(err).toBeInstanceOf(SmError);
  });

  it('SkillExistsError has SKILL_EXISTS code', () => {
    const err = new SkillExistsError('my-skill');
    expect(err.code).toBe('SKILL_EXISTS');
    expect(err.message).toBe('Skill already exists: my-skill');
  });

  it('LinkError has LINK_ERROR code', () => {
    const err = new LinkError('bad link');
    expect(err.code).toBe('LINK_ERROR');
    expect(err.message).toBe('bad link');
  });

  it('ConfigError has CONFIG_ERROR code', () => {
    const err = new ConfigError('bad config');
    expect(err.code).toBe('CONFIG_ERROR');
  });

  it('ManifestError has MANIFEST_ERROR code', () => {
    const err = new ManifestError('bad manifest');
    expect(err.code).toBe('MANIFEST_ERROR');
  });

  it('InvalidSlugError has INVALID_SLUG code', () => {
    const err = new InvalidSlugError('bad//slug');
    expect(err.code).toBe('INVALID_SLUG');
    expect(err.message).toBe('Invalid skill name: "bad//slug"');
  });

  it('UsageError has USAGE_ERROR code', () => {
    const err = new UsageError('wrong usage');
    expect(err.code).toBe('USAGE_ERROR');
  });

  it('CyclicDependencyError has CYCLIC_DEPENDENCY code', () => {
    const err = new CyclicDependencyError(['a', 'b', 'a']);
    expect(err.code).toBe('CYCLIC_DEPENDENCY');
    expect(err.message).toBe('Circular dependency detected: a → b → a');
  });

  it('SourceError has SOURCE_ERROR code', () => {
    const err = new SourceError('source problem');
    expect(err.code).toBe('SOURCE_ERROR');
  });

  it('SourceNotFoundError has SOURCE_NOT_FOUND code', () => {
    const err = new SourceNotFoundError('my-source');
    expect(err.code).toBe('SOURCE_NOT_FOUND');
    expect(err.message).toBe('Source not found: my-source');
  });

  it('PackNotFoundError has PACK_NOT_FOUND code', () => {
    const err = new PackNotFoundError('my-pack');
    expect(err.code).toBe('PACK_NOT_FOUND');
    expect(err.message).toBe('Pack not found: my-pack');
  });

  it('GenerateError has GENERATE_ERROR code', () => {
    const err = new GenerateError('gen failed');
    expect(err.code).toBe('GENERATE_ERROR');
  });
});

describe('validateSlug', () => {
  it('accepts a simple slug', () => {
    expect(() => validateSlug('my-skill')).not.toThrow();
  });

  it('accepts a slug with numbers', () => {
    expect(() => validateSlug('skill-v2')).not.toThrow();
  });

  it('accepts a single word', () => {
    expect(() => validateSlug('test')).not.toThrow();
  });

  it('rejects empty string', () => {
    expect(() => validateSlug('')).toThrow(InvalidSlugError);
  });

  it('rejects path traversal with ..', () => {
    expect(() => validateSlug('../etc')).toThrow(InvalidSlugError);
  });

  it('rejects forward slash', () => {
    expect(() => validateSlug('foo/bar')).toThrow(InvalidSlugError);
  });

  it('rejects backslash', () => {
    expect(() => validateSlug('foo\\bar')).toThrow(InvalidSlugError);
  });

  it('rejects string that slugifies to empty', () => {
    expect(() => validateSlug('!@#$%')).toThrow(InvalidSlugError);
  });

  it('accepts string with mixed case (slugifies to non-empty)', () => {
    expect(() => validateSlug('MySkill')).not.toThrow();
  });
});

describe('withErrorHandler', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('does not interfere when function succeeds', async () => {
    const fn = withErrorHandler(async () => {});
    await fn();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('formats SmError with code', async () => {
    const fn = withErrorHandler(async () => {
      throw new SmError('bad thing', 'TEST_ERR');
    });
    await fn();
    expect(errorSpy).toHaveBeenCalledWith('Error [TEST_ERR]: bad thing');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats ZodError with issues', async () => {
    const zodErr = new Error('Zod validation failed');
    zodErr.name = 'ZodError';
    (zodErr as any).issues = [{ path: ['field', 'sub'], message: 'required' }];
    const fn = withErrorHandler(async () => {
      throw zodErr;
    });
    await fn();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Data validation error:'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('field.sub: required'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats SyntaxError', async () => {
    const fn = withErrorHandler(async () => {
      throw new SyntaxError('Unexpected token');
    });
    await fn();
    expect(errorSpy).toHaveBeenCalledWith('Could not parse data file: Unexpected token');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats ENOENT error', async () => {
    const err = new Error('no such file') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    err.path = '/missing/file.json';
    const fn = withErrorHandler(async () => {
      throw err;
    });
    await fn();
    expect(errorSpy).toHaveBeenCalledWith('File not found: /missing/file.json');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats EACCES error', async () => {
    const err = new Error('permission denied') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    err.path = '/protected/file';
    const fn = withErrorHandler(async () => {
      throw err;
    });
    await fn();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Permission denied: /protected/file'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats unknown Error', async () => {
    const fn = withErrorHandler(async () => {
      throw new Error('something weird');
    });
    await fn();
    expect(errorSpy).toHaveBeenCalledWith('Unexpected error: something weird');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats non-Error throw', async () => {
    const fn = withErrorHandler(async () => {
      throw 'just a string';
    });
    await fn();
    expect(errorSpy).toHaveBeenCalledWith('Unexpected error: just a string');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

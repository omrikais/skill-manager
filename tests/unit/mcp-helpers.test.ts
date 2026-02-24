import { describe, it, expect } from 'vitest';
import { success, error, withToolHandler } from '../../src/mcp/tools/helpers.js';
import { SmError, SkillNotFoundError } from '../../src/utils/errors.js';

describe('MCP helpers', () => {
  describe('success()', () => {
    it('wraps data as JSON text content', () => {
      const result = success({ slug: 'test', name: 'Test' });
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual({ slug: 'test', name: 'Test' });
      expect(result.isError).toBeUndefined();
    });

    it('handles arrays', () => {
      const result = success([1, 2, 3]);
      expect(JSON.parse(result.content[0].text)).toEqual([1, 2, 3]);
    });

    it('handles null', () => {
      const result = success(null);
      expect(result.content[0].text).toBe('null');
    });

    it('handles strings', () => {
      const result = success('hello');
      expect(result.content[0].text).toBe('"hello"');
    });
  });

  describe('error()', () => {
    it('formats SmError with code', () => {
      const result = error(new SmError('Something failed', 'TEST_ERROR'));
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Error [TEST_ERROR]: Something failed');
    });

    it('formats SkillNotFoundError', () => {
      const result = error(new SkillNotFoundError('my-skill'));
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Error [SKILL_NOT_FOUND]: Skill not found: my-skill');
    });

    it('formats generic Error', () => {
      const result = error(new Error('generic failure'));
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('generic failure');
    });

    it('formats non-Error values', () => {
      const result = error('string error');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('string error');
    });

    it('formats number values', () => {
      const result = error(42);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('42');
    });
  });

  describe('withToolHandler()', () => {
    it('returns success on normal return', async () => {
      const handler = withToolHandler(async () => ({ status: 'ok' }));
      const result = await handler({});
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual({ status: 'ok' });
    });

    it('returns error on throw', async () => {
      const handler = withToolHandler(async () => {
        throw new SmError('test failure', 'FAIL');
      });
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Error [FAIL]: test failure');
    });

    it('passes args to the handler function', async () => {
      const handler = withToolHandler(async (args: { name: string }) => {
        return { greeting: `Hello ${args.name}` };
      });
      const result = await handler({ name: 'World' });
      expect(JSON.parse(result.content[0].text)).toEqual({ greeting: 'Hello World' });
    });
  });
});

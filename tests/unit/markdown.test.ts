import { describe, it, expect } from 'vitest';
import { renderMarkdownToTerminal } from '../../src/utils/markdown.js';

describe('renderMarkdownToTerminal', () => {
  it('returns a string', () => {
    const result = renderMarkdownToTerminal('Hello');
    expect(typeof result).toBe('string');
  });

  it('converts heading to non-empty output containing text', () => {
    const result = renderMarkdownToTerminal('# Hello');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Hello');
  });

  it('converts bold text', () => {
    const result = renderMarkdownToTerminal('**bold**');
    expect(result).toContain('bold');
  });

  it('converts code span', () => {
    const result = renderMarkdownToTerminal('`code`');
    expect(result).toContain('code');
  });
});

describe('sm marker stripping', () => {
  it('strips sm:begin markers', () => {
    const input = '<!-- sm:begin foo -->\n# Title';
    const result = renderMarkdownToTerminal(input);
    expect(result).not.toContain('sm:begin');
    expect(result).toContain('Title');
  });

  it('strips sm:end markers', () => {
    const input = '<!-- sm:end foo -->\nContent';
    const result = renderMarkdownToTerminal(input);
    expect(result).not.toContain('sm:end');
    expect(result).toContain('Content');
  });

  it('strips both markers while preserving content between them', () => {
    const input = [
      '<!-- sm:begin managed -->',
      '# Managed Section',
      'Important content here.',
      '<!-- sm:end managed -->',
    ].join('\n');
    const result = renderMarkdownToTerminal(input);
    expect(result).not.toContain('sm:begin');
    expect(result).not.toContain('sm:end');
    expect(result).toContain('Managed Section');
    expect(result).toContain('Important content here');
  });
});

describe('lazy configuration', () => {
  it('is idempotent — calling twice does not throw', () => {
    renderMarkdownToTerminal('first call');
    expect(() => renderMarkdownToTerminal('second call')).not.toThrow();
  });
});

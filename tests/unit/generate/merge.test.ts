import { describe, it, expect } from 'vitest';
import { mergeContent, detectDrift, hasManagedBlocks } from '../../../src/core/generate/merge.js';
import type { GeneratedSection } from '../../../src/core/generate/types.js';

function section(name: string, content: string): GeneratedSection {
  return { name: name as GeneratedSection['name'], title: name, content };
}

describe('mergeContent', () => {
  it('replaces existing managed blocks', () => {
    const existing = [
      '# My Project',
      '',
      '<!-- sm:begin identity -->',
      'Old identity content',
      '<!-- sm:end identity -->',
      '',
      'User content here',
    ].join('\n');

    const sections = [section('identity', 'New identity content')];
    const result = mergeContent(existing, sections);

    expect(result.content).toContain('New identity content');
    expect(result.content).not.toContain('Old identity content');
    expect(result.content).toContain('User content here');
    expect(result.sectionsUpdated).toEqual(['identity']);
  });

  it('appends new sections at end', () => {
    const existing = '# My Project\n\nSome content';
    const sections = [section('commands', '## Commands\n\n- build')];
    const result = mergeContent(existing, sections);

    expect(result.content).toContain('<!-- sm:begin commands -->');
    expect(result.content).toContain('## Commands');
    expect(result.content).toContain('<!-- sm:end commands -->');
    expect(result.content).toContain('# My Project');
    expect(result.sectionsAppended).toEqual(['commands']);
  });

  it('preserves user content outside blocks', () => {
    const existing = [
      'User header',
      '',
      '<!-- sm:begin identity -->',
      'Old content',
      '<!-- sm:end identity -->',
      '',
      'User footer',
      '',
      '<!-- sm:begin commands -->',
      'Old commands',
      '<!-- sm:end commands -->',
      '',
      'More user content',
    ].join('\n');

    const sections = [
      section('identity', 'Updated identity'),
      section('commands', 'Updated commands'),
    ];
    const result = mergeContent(existing, sections);

    expect(result.content).toContain('User header');
    expect(result.content).toContain('User footer');
    expect(result.content).toContain('More user content');
    expect(result.content).toContain('Updated identity');
    expect(result.content).toContain('Updated commands');
    expect(result.userContentPreserved).toBe(true);
  });

  it('respects section filter', () => {
    const existing = [
      '<!-- sm:begin identity -->',
      'Old identity',
      '<!-- sm:end identity -->',
      '',
      '<!-- sm:begin commands -->',
      'Old commands',
      '<!-- sm:end commands -->',
    ].join('\n');

    const sections = [
      section('identity', 'New identity'),
      section('commands', 'New commands'),
    ];
    const result = mergeContent(existing, sections, 'identity');

    expect(result.content).toContain('New identity');
    expect(result.content).toContain('Old commands'); // commands not in filter
    expect(result.sectionsUpdated).toEqual(['identity']);
    expect(result.sectionsPreserved).toEqual(['commands']);
  });

  it('handles empty existing content', () => {
    const sections = [section('identity', '# Project')];
    const result = mergeContent('', sections);

    expect(result.content).toContain('<!-- sm:begin identity -->');
    expect(result.content).toContain('# Project');
    expect(result.content).toContain('<!-- sm:end identity -->');
    expect(result.sectionsAppended).toEqual(['identity']);
  });

  it('handles multiline block content', () => {
    const existing = [
      '<!-- sm:begin commands -->',
      '## Commands',
      '',
      '| Command | Desc |',
      '|---------|------|',
      '| build | Build |',
      '<!-- sm:end commands -->',
    ].join('\n');

    const newContent = '## Commands\n\n- build\n- test';
    const sections = [section('commands', newContent)];
    const result = mergeContent(existing, sections);

    expect(result.content).toContain('- build');
    expect(result.content).toContain('- test');
    expect(result.content).not.toContain('| Command |');
  });

  it('ignores begin markers inside a block being replaced', () => {
    const existing = [
      '<!-- sm:begin identity -->',
      'Old content with <!-- sm:begin commands --> inside',
      '<!-- sm:end identity -->',
      '',
      '<!-- sm:begin commands -->',
      'Real commands',
      '<!-- sm:end commands -->',
    ].join('\n');

    const sections = [
      section('identity', 'New identity'),
      section('commands', 'New commands'),
    ];
    const result = mergeContent(existing, sections);

    // The fake begin marker inside identity block should not leak
    expect(result.content).not.toContain('Old content');
    expect(result.content).toContain('New identity');
    expect(result.content).toContain('New commands');
    expect(result.sectionsUpdated).toEqual(['identity', 'commands']);
    expect(result.sectionsAppended).toEqual([]);
  });

  it('preserves content when managed block is unclosed', () => {
    const existing = [
      '<!-- sm:begin identity -->',
      'Old identity content',
      '',  // Missing sm:end marker
      'Important user content that must not be lost',
    ].join('\n');

    const sections = [section('identity', 'New identity')];
    const result = mergeContent(existing, sections);

    // Unclosed block: all original text preserved, section appended at end
    expect(result.content).toContain('Old identity content');
    expect(result.content).toContain('Important user content that must not be lost');
    expect(result.content).toContain('New identity');
    expect(result.sectionsAppended).toContain('identity');
    expect(result.sectionsUpdated).not.toContain('identity');
  });

  it('handles CRLF line endings', () => {
    const existing =
      '<!-- sm:begin identity -->\r\nOld content\r\n<!-- sm:end identity -->\r\nUser text';

    const sections = [section('identity', 'New content')];
    const result = mergeContent(existing, sections);

    expect(result.content).toContain('New content');
    expect(result.content).not.toContain('Old content');
    expect(result.content).toContain('User text');
    expect(result.sectionsUpdated).toEqual(['identity']);
  });

  it('does not replace duplicate unclosed block with same name', () => {
    const existing = [
      '<!-- sm:begin identity -->',
      'First identity',
      '<!-- sm:end identity -->',
      '',
      'User content',
      '',
      '<!-- sm:begin identity -->',
      'Duplicate unclosed block',
      '',
      'Trailing user content that must survive',
    ].join('\n');

    const sections = [section('identity', 'New identity')];
    const result = mergeContent(existing, sections);

    // First (closed) instance replaced
    expect(result.content).toContain('New identity');
    // Duplicate unclosed begin marker preserved as text
    expect(result.content).toContain('Duplicate unclosed block');
    // Trailing content preserved
    expect(result.content).toContain('Trailing user content that must survive');
  });

  it('does not confuse nested markers', () => {
    const existing = [
      '<!-- sm:begin identity -->',
      'Content with <!-- comment --> inside',
      '<!-- sm:end identity -->',
    ].join('\n');

    const sections = [section('identity', 'Replaced')];
    const result = mergeContent(existing, sections);
    expect(result.content).toContain('Replaced');
    expect(result.sectionsUpdated).toEqual(['identity']);
  });
});

describe('detectDrift', () => {
  it('detects when block content differs', () => {
    const existing = [
      '<!-- sm:begin identity -->',
      'Old content',
      '<!-- sm:end identity -->',
    ].join('\n');

    const sections = [section('identity', 'New content')];
    const drift = detectDrift(existing, sections);

    expect(drift).toHaveLength(1);
    expect(drift[0].name).toBe('identity');
    expect(drift[0].existingContent).toBe('Old content');
    expect(drift[0].generatedContent).toBe('New content');
  });

  it('returns empty when content matches', () => {
    const existing = [
      '<!-- sm:begin identity -->',
      'Same content',
      '<!-- sm:end identity -->',
    ].join('\n');

    const sections = [section('identity', 'Same content')];
    const drift = detectDrift(existing, sections);
    expect(drift).toHaveLength(0);
  });

  it('ignores sections not in existing', () => {
    const existing = 'No blocks here';
    const sections = [section('identity', 'Content')];
    const drift = detectDrift(existing, sections);
    expect(drift).toHaveLength(0);
  });
});

describe('hasManagedBlocks', () => {
  it('returns true when blocks exist', () => {
    const content = [
      '<!-- sm:begin identity -->',
      'Content',
      '<!-- sm:end identity -->',
    ].join('\n');
    expect(hasManagedBlocks(content)).toBe(true);
  });

  it('returns false without blocks', () => {
    expect(hasManagedBlocks('# Just a readme')).toBe(false);
  });

  it('returns false for unclosed blocks', () => {
    expect(hasManagedBlocks('<!-- sm:begin identity -->\nContent')).toBe(false);
  });
});

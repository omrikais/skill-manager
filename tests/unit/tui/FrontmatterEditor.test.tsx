import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { FrontmatterEditor } from '../../../src/tui/components/FrontmatterEditor.js';

describe('FrontmatterEditor', () => {
  const defaultFields = {
    name: 'Test Skill',
    description: 'A test skill',
    tags: 'util, dev',
  };

  it('renders all field labels', () => {
    const { lastFrame } = render(
      <FrontmatterEditor
        fields={defaultFields}
        fieldIndex={0}
        editingField={false}
        onFieldChange={() => {}}
        onFieldSubmit={() => {}}
      />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Name');
    expect(frame).toContain('Description');
    expect(frame).toContain('Tags');
  });

  it('renders field values', () => {
    const { lastFrame } = render(
      <FrontmatterEditor
        fields={defaultFields}
        fieldIndex={0}
        editingField={false}
        onFieldChange={() => {}}
        onFieldSubmit={() => {}}
      />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Test Skill');
    expect(frame).toContain('A test skill');
    expect(frame).toContain('util, dev');
  });

  it('shows selected indicator on active field', () => {
    const { lastFrame } = render(
      <FrontmatterEditor
        fields={defaultFields}
        fieldIndex={1}
        editingField={false}
        onFieldChange={() => {}}
        onFieldSubmit={() => {}}
      />
    );
    const frame = lastFrame()!;
    // Selected field should have the ▸ indicator
    expect(frame).toContain('\u25B8');
  });

  it('shows Edit Frontmatter heading', () => {
    const { lastFrame } = render(
      <FrontmatterEditor
        fields={defaultFields}
        fieldIndex={0}
        editingField={false}
        onFieldChange={() => {}}
        onFieldSubmit={() => {}}
      />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Edit Frontmatter');
  });

  it('shows navigation help when not editing', () => {
    const { lastFrame } = render(
      <FrontmatterEditor
        fields={defaultFields}
        fieldIndex={0}
        editingField={false}
        onFieldChange={() => {}}
        onFieldSubmit={() => {}}
      />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('j/k');
    expect(frame).toContain('navigate');
  });

  it('shows (empty) for empty field values', () => {
    const { lastFrame } = render(
      <FrontmatterEditor
        fields={{ name: '', description: '', tags: '' }}
        fieldIndex={0}
        editingField={false}
        onFieldChange={() => {}}
        onFieldSubmit={() => {}}
      />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('(empty)');
  });
});

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { ConfirmDialog } from '../../../src/tui/components/ConfirmDialog.js';

describe('ConfirmDialog', () => {
  it('renders title', () => {
    const { lastFrame } = render(
      <ConfirmDialog title="Delete skill?" />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Delete skill?');
  });

  it('renders message when provided', () => {
    const { lastFrame } = render(
      <ConfirmDialog title="Confirm" message="This will remove all data." />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('This will remove all data.');
  });

  it('renders warning when provided', () => {
    const { lastFrame } = render(
      <ConfirmDialog title="Delete" warning="This action cannot be undone." />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('This action cannot be undone.');
  });

  it('shows custom labels', () => {
    const { lastFrame } = render(
      <ConfirmDialog
        title="Save?"
        confirmLabel="save changes"
        cancelLabel="discard"
      />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('save changes');
    expect(frame).toContain('discard');
  });

  it('shows default y/n/Esc bindings', () => {
    const { lastFrame } = render(
      <ConfirmDialog title="Test" />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('y');
    expect(frame).toContain('n');
    expect(frame).toContain('Esc');
  });
});

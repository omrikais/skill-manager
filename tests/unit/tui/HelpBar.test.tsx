import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { HelpBar } from '../../../src/tui/components/HelpBar.js';

describe('HelpBar', () => {
  it('renders key-action pairs', () => {
    const bindings = [
      { key: 'j/k', action: 'navigate' },
      { key: 'Enter', action: 'select' },
      { key: 'q', action: 'quit' },
    ];

    const { lastFrame } = render(<HelpBar bindings={bindings} />);
    const frame = lastFrame()!;

    expect(frame).toContain('j/k');
    expect(frame).toContain('navigate');
    expect(frame).toContain('Enter');
    expect(frame).toContain('select');
    expect(frame).toContain('q');
    expect(frame).toContain('quit');
  });

  it('renders empty bindings without error', () => {
    const { lastFrame } = render(<HelpBar bindings={[]} />);
    expect(lastFrame()).toBeDefined();
  });
});

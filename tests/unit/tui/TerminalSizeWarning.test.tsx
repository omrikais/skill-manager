import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { TerminalSizeWarning } from '../../../src/tui/components/TerminalSizeWarning.js';

describe('TerminalSizeWarning', () => {
  it('renders the warning message with dimensions', () => {
    const { lastFrame } = render(
      <TerminalSizeWarning screenName="Dashboard" width={60} height={15} minWidth={90} minHeight={24} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Terminal too small for Dashboard');
    expect(frame).toContain('60x15');
    expect(frame).toContain('>=90x24');
    expect(frame).toContain('Resize terminal and retry');
  });

  it('renders with different screen name', () => {
    const { lastFrame } = render(
      <TerminalSizeWarning screenName="Browser" width={80} height={20} minWidth={90} minHeight={24} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Terminal too small for Browser');
    expect(frame).toContain('80x20');
  });
});

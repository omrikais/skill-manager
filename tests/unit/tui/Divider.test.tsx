import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Divider } from '../../../src/tui/components/Divider.js';
import { ScreenSizeContext } from '../../../src/tui/App.js';

function NarrowWrapper({ width, children }: { width: number; children: React.ReactNode }) {
  return <ScreenSizeContext.Provider value={{ height: 30, width }}>{children}</ScreenSizeContext.Provider>;
}

describe('Divider', () => {
  it('renders a line when no label', () => {
    const { lastFrame } = render(<Divider />);
    const frame = lastFrame()!;
    // Should contain horizontal line characters (─)
    expect(frame).toContain('\u2500');
  });

  it('renders with a label', () => {
    const { lastFrame } = render(<Divider label="Skills" />);
    const frame = lastFrame()!;
    expect(frame).toContain('Skills');
    expect(frame).toContain('\u2500');
  });

  it('renders with both label and right label', () => {
    const { lastFrame } = render(<Divider label="Skills" rightLabel="3/10" />);
    const frame = lastFrame()!;
    expect(frame).toContain('Skills');
    expect(frame).toContain('3/10');
  });

  it('truncates long labels at narrow width', () => {
    const longLeft = 'A'.repeat(50);
    const longRight = 'B'.repeat(50);
    const narrowWidth = 30;

    const { lastFrame } = render(
      <NarrowWrapper width={narrowWidth}>
        <Divider label={longLeft} rightLabel={longRight} />
      </NarrowWrapper>,
    );
    const frame = lastFrame()!;
    // Ellipsis should appear since labels are truncated
    expect(frame).toContain('\u2026');
    // The rendered output should not exceed the available width
    // (strip ANSI codes and measure longest line)
    const lines = frame.split('\n');
    for (const line of lines) {
      const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
      expect(stripped.length).toBeLessThanOrEqual(narrowWidth);
    }
  });

  it('handles extremely narrow width gracefully', () => {
    const { lastFrame } = render(
      <NarrowWrapper width={12}>
        <Divider label="Some Label" rightLabel="right" />
      </NarrowWrapper>,
    );
    const frame = lastFrame()!;
    // Should render without errors — line characters present
    expect(frame).toContain('\u2500');
    const lines = frame.split('\n');
    for (const line of lines) {
      const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
      expect(stripped.length).toBeLessThanOrEqual(12);
    }
  });
});

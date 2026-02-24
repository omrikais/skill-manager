import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { HelpOverlay } from '../../../src/tui/components/HelpOverlay.js';

describe('HelpOverlay', () => {
  it('renders help for dashboard screen', () => {
    const { lastFrame } = render(<HelpOverlay screen="dashboard" onClose={() => {}} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Key Reference');
    expect(frame).toContain('Dashboard');
    expect(frame).toContain('Navigation');
    expect(frame).toContain('j/k');
  });

  it('renders help for browser screen', () => {
    const { lastFrame } = render(<HelpOverlay screen="browser" onClose={() => {}} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Browser');
    expect(frame).toContain('Multi-Select');
  });

  it('includes global help section', () => {
    const { lastFrame } = render(<HelpOverlay screen="dashboard" onClose={() => {}} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Global');
    expect(frame).toContain('Quit');
  });

  it('shows close instructions', () => {
    const { lastFrame } = render(<HelpOverlay screen="dashboard" onClose={() => {}} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Esc');
  });

  it('filters sources screen to Source List category', () => {
    const { lastFrame } = render(<HelpOverlay screen="sources" onClose={() => {}} activeCategory="Source List" />);
    const frame = lastFrame()!;
    expect(frame).toContain('Source List');
    expect(frame).toContain('Navigate sources');
    expect(frame).not.toContain('Source Detail');
    expect(frame).not.toContain('Diff View');
  });

  it('filters sources screen to Source Detail category', () => {
    const { lastFrame } = render(<HelpOverlay screen="sources" onClose={() => {}} activeCategory="Source Detail" />);
    const frame = lastFrame()!;
    expect(frame).toContain('Source Detail');
    expect(frame).toContain('Install or update');
    expect(frame).not.toContain('Source List');
    expect(frame).not.toContain('Diff View');
  });
});

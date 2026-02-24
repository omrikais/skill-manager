import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { StatusBar } from '../../../src/tui/components/StatusBar.js';

describe('StatusBar', () => {
  it('renders screen name and counts', () => {
    const { lastFrame } = render(<StatusBar screenName="Dashboard" totalSkills={10} userCount={5} projectCount={2} />);
    const frame = lastFrame()!;

    expect(frame).toContain('sm');
    expect(frame).toContain('Dashboard');
    expect(frame).toContain('10 skills');
    expect(frame).toContain('5 user');
    expect(frame).toContain('2 project');
  });

  it('does not show issues count', () => {
    const { lastFrame } = render(<StatusBar screenName="Sync" totalSkills={5} userCount={3} projectCount={0} />);
    const frame = lastFrame()!;
    expect(frame).not.toContain('issues');
  });

  it('shows right label instead of counts when provided', () => {
    const { lastFrame } = render(
      <StatusBar screenName="Detail" totalSkills={5} userCount={3} projectCount={0} rightLabel="v2 (3 versions)" />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('v2 (3 versions)');
    expect(frame).not.toContain('skills');
  });
});

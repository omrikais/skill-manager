import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { SkillBrowserScreen } from '../../../src/tui/screens/SkillBrowserScreen.js';
import { InputActiveContext, ScreenSizeContext } from '../../../src/tui/App.js';
import type { Skill } from '../../../src/core/skill.js';
import type { LinkRecord } from '../../../src/core/state.js';

function makeSkill(slug: string): Skill {
  return {
    slug,
    name: slug,
    description: `Description of ${slug}`,
    tags: [],
    content: { frontmatter: {}, content: '' },
    meta: {
      format: 'skill',
      source: { type: 'created' },
      tags: [],
      deployAs: { cc: 'skill', codex: 'skill' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0,
    },
  } as Skill;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ScreenSizeContext.Provider value={{ height: 30, width: 100 }}>
      <InputActiveContext.Provider value={true}>{children}</InputActiveContext.Provider>
    </ScreenSizeContext.Provider>
  );
}

function SmallWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ScreenSizeContext.Provider value={{ height: 15, width: 60 }}>
      <InputActiveContext.Provider value={true}>{children}</InputActiveContext.Provider>
    </ScreenSizeContext.Provider>
  );
}

describe('SkillBrowserScreen', () => {
  it('shows terminal size warning when terminal is too small', () => {
    const { lastFrame } = render(
      <SmallWrapper>
        <SkillBrowserScreen
          skills={[makeSkill('test')]}
          links={[]}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onRefresh={() => {}}
        />
      </SmallWrapper>,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Terminal too small');
    expect(frame).toContain('Browser');
    expect(frame).toContain('Resize terminal');
  });

  it('renders skill list', () => {
    const skills = [makeSkill('alpha'), makeSkill('beta'), makeSkill('gamma')];

    const { lastFrame } = render(
      <Wrapper>
        <SkillBrowserScreen
          skills={skills}
          links={[]}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onRefresh={() => {}}
        />
      </Wrapper>,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('alpha');
    expect(frame).toContain('beta');
    expect(frame).toContain('gamma');
  });

  it('shows default filter label', () => {
    const { lastFrame } = render(
      <Wrapper>
        <SkillBrowserScreen
          skills={[makeSkill('test')]}
          links={[]}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onRefresh={() => {}}
        />
      </Wrapper>,
    );
    const frame = lastFrame()!;
    // The browser shows the filter as "Filter: all" in the header
    expect(frame).toContain('all');
  });

  it('renders with empty skills', () => {
    const { lastFrame } = render(
      <Wrapper>
        <SkillBrowserScreen
          skills={[]}
          links={[]}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onRefresh={() => {}}
        />
      </Wrapper>,
    );
    const frame = lastFrame()!;
    // Should render without crashing, shows empty state
    expect(frame).toBeDefined();
  });
});

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { DashboardScreen } from '../../../src/tui/screens/DashboardScreen.js';
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

function makeLink(slug: string, tool: 'cc' | 'codex'): LinkRecord {
  return {
    slug,
    tool,
    format: 'skill',
    linkPath: `/fake/${tool}/${slug}`,
    targetPath: `/fake/skills/${slug}`,
    createdAt: new Date().toISOString(),
  } as LinkRecord;
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

describe('DashboardScreen', () => {
  it('shows terminal size warning when terminal is too small', () => {
    const { lastFrame } = render(
      <SmallWrapper>
        <DashboardScreen
          skills={[makeSkill('test')]}
          links={[]}
          loading={false}
          selectedIndex={0}
          onSelectIndex={() => {}}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onTextInputChange={() => {}}
        />
      </SmallWrapper>,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Terminal too small');
    expect(frame).toContain('Dashboard');
    expect(frame).toContain('Resize terminal');
  });

  it('shows loading state', () => {
    const { lastFrame } = render(
      <Wrapper>
        <DashboardScreen
          skills={[]}
          links={[]}
          loading={true}
          selectedIndex={0}
          onSelectIndex={() => {}}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onTextInputChange={() => {}}
        />
      </Wrapper>,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Loading');
  });

  it('shows empty state when no skills', () => {
    const { lastFrame } = render(
      <Wrapper>
        <DashboardScreen
          skills={[]}
          links={[]}
          loading={false}
          selectedIndex={0}
          onSelectIndex={() => {}}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onTextInputChange={() => {}}
        />
      </Wrapper>,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('No skills found');
  });

  it('renders skill list when skills exist', () => {
    const skills = [makeSkill('alpha'), makeSkill('beta')];
    const links = [makeLink('alpha', 'cc')];

    const { lastFrame } = render(
      <Wrapper>
        <DashboardScreen
          skills={skills}
          links={links}
          loading={false}
          selectedIndex={0}
          onSelectIndex={() => {}}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onTextInputChange={() => {}}
        />
      </Wrapper>,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('alpha');
    expect(frame).toContain('beta');
  });

  it('renders help bar with key bindings', () => {
    const { lastFrame } = render(
      <Wrapper>
        <DashboardScreen
          skills={[makeSkill('test')]}
          links={[]}
          loading={false}
          selectedIndex={0}
          onSelectIndex={() => {}}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onTextInputChange={() => {}}
        />
      </Wrapper>,
    );
    // HelpBar wraps at the 80-column ink test terminal, splitting words mid-character.
    // Check for substrings that appear contiguously in the wrapped output.
    const frame = lastFrame()!;
    expect(frame).toContain('detail');
    expect(frame).toContain('browse');
    expect(frame).toContain('sync');
    expect(frame).toContain('quit');
  });

  it('renders MCP shortcut in help bar', () => {
    const { lastFrame } = render(
      <Wrapper>
        <DashboardScreen
          skills={[makeSkill('test')]}
          links={[]}
          loading={false}
          selectedIndex={0}
          onSelectIndex={() => {}}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onTextInputChange={() => {}}
        />
      </Wrapper>,
    );
    // HelpBar wraps at the 80-column ink test terminal, so check
    // that the MCP binding content is present in the rendered output.
    const frame = lastFrame()!;
    expect(frame).toContain('MCP');
    expect(frame).toContain('setup');
    expect(frame).toContain('remove');
  });

  it('renders scope bars', () => {
    const skills = [makeSkill('test')];
    const links = [makeLink('test', 'cc')];

    const { lastFrame } = render(
      <Wrapper>
        <DashboardScreen
          skills={skills}
          links={links}
          loading={false}
          selectedIndex={0}
          onSelectIndex={() => {}}
          onNavigate={() => {}}
          onSelectSkill={() => {}}
          onTextInputChange={() => {}}
        />
      </Wrapper>,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('User');
    expect(frame).toContain('Project');
  });
});

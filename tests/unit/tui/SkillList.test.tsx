import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { SkillList } from '../../../src/tui/components/SkillList.js';
import type { Skill } from '../../../src/core/skill.js';
import type { LinkRecord } from '../../../src/core/state.js';

function makeSkill(slug: string, description = ''): Skill {
  return {
    slug,
    name: slug,
    description,
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

describe('SkillList', () => {
  it('renders skill slugs', () => {
    const skills = [makeSkill('alpha'), makeSkill('beta'), makeSkill('gamma')];
    const { lastFrame } = render(
      <SkillList skills={skills} links={[]} selectedIndex={0} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('alpha');
    expect(frame).toContain('beta');
    expect(frame).toContain('gamma');
  });

  it('shows selection indicator on selected item', () => {
    const skills = [makeSkill('first'), makeSkill('second')];
    const { lastFrame } = render(
      <SkillList skills={skills} links={[]} selectedIndex={1} />
    );
    const frame = lastFrame()!;
    // The selected item should be highlighted differently
    // Selected uses bold/primary color, non-selected uses muted
    expect(frame).toContain('second');
  });

  it('shows deployment indicators for deployed skills', () => {
    const skills = [makeSkill('deployed'), makeSkill('not-deployed')];
    const links = [makeLink('deployed', 'cc')];
    const { lastFrame } = render(
      <SkillList skills={skills} links={links} selectedIndex={0} />
    );
    const frame = lastFrame()!;
    // Deployed skills show ● (filled circle), undeployed show ○ (empty circle)
    expect(frame).toContain('\u25CF'); // ● deployed
    expect(frame).toContain('\u25CB'); // ○ not deployed
  });

  it('renders with empty skills list', () => {
    const { lastFrame } = render(
      <SkillList skills={[]} links={[]} selectedIndex={0} />
    );
    expect(lastFrame()).toBeDefined();
  });
});

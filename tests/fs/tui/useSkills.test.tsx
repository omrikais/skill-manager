import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { createTmpSmHome, type TmpSmHome } from '../../helpers/tmpdir.js';
import { createTestSkill } from '../../helpers/skill-factory.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
});

describe('useSkills', () => {
  it('loads skills on mount', async () => {
    await createTestSkill('hook-skill', { name: 'Hook Skill', description: 'For hook test' });

    const { useSkills } = await import('../../../src/tui/hooks/useSkills.js');

    let resolved: { skills: Array<{ slug: string }>; loading: boolean; error: string | null } | null = null;

    function Wrapper() {
      const result = useSkills();
      useEffect(() => {
        if (!result.loading) {
          resolved = result;
        }
      }, [result.loading]);
      return <Text>{result.loading ? 'loading' : `done:${result.skills.length}`}</Text>;
    }

    const { lastFrame, unmount } = render(<Wrapper />);

    // Wait for async load
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('done:1');
    }, { timeout: 5000 });

    expect(resolved).not.toBeNull();
    expect(resolved!.skills).toHaveLength(1);
    expect(resolved!.skills[0].slug).toBe('hook-skill');
    expect(resolved!.error).toBeNull();

    unmount();
  });

  it('returns empty array when no skills exist', async () => {
    const { useSkills } = await import('../../../src/tui/hooks/useSkills.js');

    function Wrapper() {
      const result = useSkills();
      return <Text>{result.loading ? 'loading' : `done:${result.skills.length}`}</Text>;
    }

    const { lastFrame, unmount } = render(<Wrapper />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('done:0');
    }, { timeout: 5000 });

    unmount();
  });

  it('supports refresh callback', async () => {
    const { useSkills } = await import('../../../src/tui/hooks/useSkills.js');

    let refreshFn: (() => void) | null = null;

    function Wrapper() {
      const result = useSkills();
      useEffect(() => {
        if (!result.loading) {
          refreshFn = result.refresh;
        }
      }, [result.loading]);
      return <Text>{result.loading ? 'loading' : `done:${result.skills.length}`}</Text>;
    }

    const { lastFrame, unmount } = render(<Wrapper />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('done:0');
    }, { timeout: 5000 });

    // Create a skill and trigger refresh
    await createTestSkill('added-later', { name: 'Added Later', description: 'Created after mount' });
    expect(refreshFn).not.toBeNull();

    // Call refresh
    await refreshFn!();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('done:1');
    }, { timeout: 5000 });

    unmount();
  });
});

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

describe('useDeployments', () => {
  it('loads links on mount', async () => {
    await createTestSkill('deploy-hook', { name: 'Deploy Hook', description: 'For hook test' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('deploy-hook', 'cc');

    const { useDeployments } = await import('../../../src/tui/hooks/useDeployments.js');

    let resolved: { links: Array<{ slug: string }>; loading: boolean } | null = null;

    function Wrapper() {
      const result = useDeployments();
      useEffect(() => {
        if (!result.loading) {
          resolved = result;
        }
      }, [result.loading]);
      return <Text>{result.loading ? 'loading' : `done:${result.links.length}`}</Text>;
    }

    const { lastFrame, unmount } = render(<Wrapper />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('done:1');
    }, { timeout: 5000 });

    expect(resolved).not.toBeNull();
    expect(resolved!.links).toHaveLength(1);
    expect(resolved!.links[0].slug).toBe('deploy-hook');

    unmount();
  });

  it('isDeployed returns true for deployed skill', async () => {
    await createTestSkill('is-deployed', { name: 'Is Deployed', description: 'Test' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('is-deployed', 'cc');

    const { useDeployments } = await import('../../../src/tui/hooks/useDeployments.js');

    let isDeployedFn: ((slug: string, tool?: 'cc' | 'codex') => boolean) | null = null;

    function Wrapper() {
      const result = useDeployments();
      useEffect(() => {
        if (!result.loading) {
          isDeployedFn = result.isDeployed;
        }
      }, [result.loading]);
      return <Text>{result.loading ? 'loading' : 'done'}</Text>;
    }

    const { lastFrame, unmount } = render(<Wrapper />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('done');
    }, { timeout: 5000 });

    expect(isDeployedFn).not.toBeNull();
    expect(isDeployedFn!('is-deployed')).toBe(true);
    expect(isDeployedFn!('is-deployed', 'cc')).toBe(true);
    expect(isDeployedFn!('is-deployed', 'codex')).toBe(false);
    expect(isDeployedFn!('nonexistent')).toBe(false);

    unmount();
  });

  it('getLinksForSkill returns matching links', async () => {
    await createTestSkill('multi-deploy', { name: 'Multi', description: 'Both tools' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('multi-deploy', 'cc');
    await deploy('multi-deploy', 'codex');

    const { useDeployments } = await import('../../../src/tui/hooks/useDeployments.js');

    let getLinksForSkillFn: ((slug: string) => Array<{ slug: string; tool: string }>) | null = null;

    function Wrapper() {
      const result = useDeployments();
      useEffect(() => {
        if (!result.loading) {
          getLinksForSkillFn = result.getLinksForSkill;
        }
      }, [result.loading]);
      return <Text>{result.loading ? 'loading' : `done:${result.links.length}`}</Text>;
    }

    const { lastFrame, unmount } = render(<Wrapper />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('done:2');
    }, { timeout: 5000 });

    expect(getLinksForSkillFn).not.toBeNull();
    const links = getLinksForSkillFn!('multi-deploy');
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.tool).sort()).toEqual(['cc', 'codex']);

    unmount();
  });
});

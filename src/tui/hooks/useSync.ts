import { useState, useCallback } from 'react';
import { loadState, type LinkRecord } from '../../core/state.js';
import { validateLink, repairLink, type LinkStatus } from '../../fs/links.js';
import { deployLinkPath, type ToolName, type DeployFormat } from '../../fs/paths.js';
import { deploy, undeploy } from '../../deploy/engine.js';
import { readMeta, writeMeta } from '../../core/meta.js';

export interface SyncResult {
  link: LinkRecord;
  status: LinkStatus;
}

export interface DeprecatedLink {
  link: LinkRecord;
  canonicalPath: string;
  reason: 'path' | 'format';
}

export function useSync() {
  const [results, setResults] = useState<SyncResult[]>([]);
  const [deprecated, setDeprecated] = useState<DeprecatedLink[]>([]);
  const [running, setRunning] = useState(false);

  const runSync = useCallback(async () => {
    setRunning(true);
    try {
      const state = await loadState();
      const syncResults: SyncResult[] = [];
      const deprecatedLinks: DeprecatedLink[] = [];

      for (const link of state.links) {
        if ((link.scope ?? 'user') === 'user') {
          // Deprecated format: legacy-prompt should migrate to skill
          if (link.format === 'legacy-prompt' && link.tool === 'codex') {
            const canonicalPath = deployLinkPath('codex', 'skill', link.slug)!;
            deprecatedLinks.push({ link, canonicalPath, reason: 'format' });
            continue;
          }

          // Deprecated path: link path differs from current canonical
          const canonicalPath = deployLinkPath(link.tool as ToolName, link.format as DeployFormat, link.slug);
          if (canonicalPath && link.linkPath !== canonicalPath) {
            deprecatedLinks.push({ link, canonicalPath, reason: 'path' });
            continue;
          }
        }

        const status = await validateLink(link.linkPath, link.targetPath);
        syncResults.push({ link, status });
      }

      setResults(syncResults);
      setDeprecated(deprecatedLinks);
    } finally {
      setRunning(false);
    }
  }, []);

  const repair = useCallback(async (linkPath: string, expectedTarget: string) => {
    await repairLink(linkPath, expectedTarget);
    await runSync();
  }, [runSync]);

  const migrate = useCallback(async () => {
    setRunning(true);
    try {
      for (const d of deprecated) {
        if (d.reason === 'format') {
          // Undeploy old format, update meta, deploy as skill
          await undeploy(d.link.slug, d.link.tool as ToolName, d.link.format as DeployFormat);
          const meta = await readMeta(d.link.slug);
          meta.deployAs.codex = 'skill';
          await writeMeta(d.link.slug, meta);
          await deploy(d.link.slug, 'codex', 'skill');
        } else {
          // Same format, different path — redeploy picks up new canonical path
          await deploy(d.link.slug, d.link.tool as ToolName, d.link.format as DeployFormat);
        }
      }
      await runSync();
    } finally {
      setRunning(false);
    }
  }, [deprecated, runSync]);

  const healthy = results.filter((r) => r.status.health === 'healthy').length;
  const issues = results.filter((r) => r.status.health !== 'healthy').length;

  return { results, deprecated, running, runSync, repair, migrate, healthy, issues };
}

import React, { useEffect, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { InputActiveContext, ScreenSizeContext } from '../App.js';
import { Spinner } from '@inkjs/ui';
import { useSync } from '../hooks/useSync.js';
import { HelpBar } from '../components/HelpBar.js';
import { Divider } from '../components/Divider.js';
import { colors } from '../theme.js';
import type { ScreenName } from '../theme.js';
import { truncate } from '../utils/truncate.js';

interface SyncResultsScreenProps {
  onNavigate: (screen: ScreenName) => void;
}

export function SyncResultsScreen({ onNavigate }: SyncResultsScreenProps) {
  const { results, deprecated, running, runSync, repair, migrate, healthy, issues } = useSync();

  useEffect(() => {
    runSync();
  }, [runSync]);

  const inputActive = useContext(InputActiveContext);
  const { height, width } = useContext(ScreenSizeContext);

  useInput(
    (input, key) => {
      if (key.escape) {
        onNavigate('dashboard');
      }
      if (input === 'r' && !running) {
        (async () => {
          for (const r of results) {
            if (r.status.health !== 'healthy') {
              await repair(r.status.linkPath, r.status.expectedTarget);
            }
          }
        })();
      }
      if (input === 'm' && !running && deprecated.length > 0) {
        migrate();
      }
      if (input === 's' && !running) {
        runSync();
      }
    },
    { isActive: inputActive },
  );

  if (running) {
    return (
      <Box flexDirection="column">
        <Spinner label="Validating symlinks..." />
      </Box>
    );
  }

  const broken = results.filter((r) => r.status.health === 'broken');
  const missing = results.filter((r) => r.status.health === 'missing');
  const stale = results.filter((r) => r.status.health === 'stale');
  const conflicts = results.filter((r) => r.status.health === 'conflict');
  const activeSections = [deprecated, broken, missing, stale, conflicts].filter((a) => a.length > 0).length;
  // Chrome: summary(2) + section headers(~2 each) + HelpBar(2) + buffer(2) ≈ 14
  const maxPerSection = Math.max(3, Math.floor((height - 14) / Math.max(1, activeSections)));

  return (
    <Box flexDirection="column">
      <Box marginTop={1} gap={2}>
        <Text color={colors.success}>
          Healthy: <Text bold>{healthy}</Text>
        </Text>
        <Text color={colors.error}>
          Broken: <Text bold>{broken.length}</Text>
        </Text>
        <Text color={colors.warning}>
          Missing: <Text bold>{missing.length}</Text>
        </Text>
        <Text color={colors.warning}>
          Stale: <Text bold>{stale.length}</Text>
        </Text>
        <Text color={colors.error}>
          Conflict: <Text bold>{conflicts.length}</Text>
        </Text>
        {deprecated.length > 0 && (
          <Text color={colors.accent}>
            Deprecated: <Text bold>{deprecated.length}</Text>
          </Text>
        )}
      </Box>

      {deprecated.length > 0 && (
        <>
          <Divider label={`Deprecated paths (${deprecated.length})`} />
          <Box marginTop={1} flexDirection="column">
            {deprecated.slice(0, maxPerSection).map((d, i) => (
              <Text key={`deprecated-${i}`} color={colors.accent}>
                {truncate(
                  d.reason === 'format'
                    ? `  \u203A ${d.link.slug} (${d.link.tool}): ${d.link.format} \u2192 skill`
                    : `  \u203A ${d.link.slug} (${d.link.tool}): ${d.link.linkPath} \u2192 ${d.canonicalPath}`,
                  width - 2,
                )}
              </Text>
            ))}
            {deprecated.length > maxPerSection && (
              <Text color={colors.dim}> … and {deprecated.length - maxPerSection} more</Text>
            )}
          </Box>
        </>
      )}

      {broken.length > 0 && (
        <>
          <Divider label={`Broken (${broken.length})`} />
          <Box marginTop={1} flexDirection="column">
            {broken.slice(0, maxPerSection).map((r, i) => (
              <Text key={`broken-${i}`} color={colors.error}>
                {truncate(`  \u2717 ${r.link.slug} (${r.link.tool}): ${r.status.detail}`, width - 2)}
              </Text>
            ))}
            {broken.length > maxPerSection && (
              <Text color={colors.dim}> … and {broken.length - maxPerSection} more</Text>
            )}
          </Box>
        </>
      )}

      {missing.length > 0 && (
        <>
          <Divider label={`Missing (${missing.length})`} />
          <Box marginTop={1} flexDirection="column">
            {missing.slice(0, maxPerSection).map((r, i) => (
              <Text key={`missing-${i}`} color={colors.warning}>
                {truncate(`  ? ${r.link.slug} (${r.link.tool}): ${r.status.detail}`, width - 2)}
              </Text>
            ))}
            {missing.length > maxPerSection && (
              <Text color={colors.dim}> … and {missing.length - maxPerSection} more</Text>
            )}
          </Box>
        </>
      )}

      {stale.length > 0 && (
        <>
          <Divider label={`Stale (${stale.length})`} />
          <Box marginTop={1} flexDirection="column">
            {stale.slice(0, maxPerSection).map((r, i) => (
              <Text key={`stale-${i}`} color={colors.warning}>
                {truncate(`  ~ ${r.link.slug} (${r.link.tool}): ${r.status.detail}`, width - 2)}
              </Text>
            ))}
            {stale.length > maxPerSection && <Text color={colors.dim}> … and {stale.length - maxPerSection} more</Text>}
          </Box>
        </>
      )}

      {conflicts.length > 0 && (
        <>
          <Divider label={`Conflicts (${conflicts.length})`} />
          <Box marginTop={1} flexDirection="column">
            {conflicts.slice(0, maxPerSection).map((r, i) => (
              <Text key={`conflict-${i}`} color={colors.error}>
                {truncate(`  ! ${r.link.slug} (${r.link.tool}): ${r.status.detail}`, width - 2)}
              </Text>
            ))}
            {conflicts.length > maxPerSection && (
              <Text color={colors.dim}> … and {conflicts.length - maxPerSection} more</Text>
            )}
          </Box>
        </>
      )}

      {issues === 0 && deprecated.length === 0 && (
        <Box marginTop={1}>
          <Text color={colors.success}>All symlinks healthy!</Text>
        </Box>
      )}

      <HelpBar
        bindings={[
          ...(deprecated.length > 0 ? [{ key: 'm', action: 'migrate' }] : []),
          { key: 'r', action: 'repair all' },
          { key: 's', action: 're-scan' },
          { key: '?', action: 'help' },
          { key: 'Esc', action: 'back' },
        ]}
      />
    </Box>
  );
}

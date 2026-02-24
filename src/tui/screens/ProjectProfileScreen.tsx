import React, { useState, useEffect, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { InputActiveContext, ScreenSizeContext } from '../App.js';
import { Spinner } from '@inkjs/ui';
import { listProfiles, type Profile } from '../../core/profile.js';
import { deploy } from '../../deploy/engine.js';
import { HelpBar } from '../components/HelpBar.js';
import { Divider } from '../components/Divider.js';
import { colors } from '../theme.js';
import type { ScreenName } from '../theme.js';
import { clampIndex } from '../utils/clampIndex.js';
import { truncate } from '../utils/truncate.js';

interface ProjectProfileScreenProps {
  onNavigate: (screen: ScreenName) => void;
  onRefresh: () => void;
}

export function ProjectProfileScreen({ onNavigate, onRefresh }: ProjectProfileScreenProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'warning' | 'error'>('success');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const p = await listProfiles();
        setProfiles(p);
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, []);

  const inputActive = useContext(InputActiveContext);
  const { width } = useContext(ScreenSizeContext);

  useInput(
    (input, key) => {
      if (busy) return;
      if (key.escape) {
        onNavigate('dashboard');
      }
      if (input === 'j' || key.downArrow) {
        setSelectedIndex((i) => clampIndex(profiles.length, i + 1));
      }
      if (input === 'k' || key.upArrow) {
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (key.return && profiles[selectedIndex]) {
        const profile = profiles[selectedIndex];
        setBusy(true);
        (async () => {
          let deployed = 0;
          let failed = 0;
          for (const skill of profile.skills) {
            for (const tool of skill.tools) {
              try {
                const result = await deploy(skill.name, tool);
                if (result.action === 'deployed') deployed++;
              } catch {
                failed++;
              }
            }
          }
          if (failed === 0) {
            setMessage(`Applied "${profile.name}": ${deployed} deployments`);
            setMessageType('success');
          } else if (deployed > 0) {
            setMessage(`Applied "${profile.name}": ${deployed} deployed, ${failed} failed`);
            setMessageType('warning');
          } else {
            setMessage(`Failed to apply "${profile.name}": ${failed} errors`);
            setMessageType('error');
          }
          setBusy(false);
          onRefresh();
        })();
      }
    },
    { isActive: inputActive },
  );

  if (loading) {
    return (
      <Box flexDirection="column">
        <Spinner label="Loading profiles..." />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {profiles.length === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={colors.warning}>No profiles found.</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={colors.muted}>Profiles save and restore deploy configurations.</Text>
            <Text color={colors.muted}>Create one from the terminal:</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={colors.text} bold>
              {' '}
              sm profile create {'<name>'}
            </Text>
          </Box>
        </Box>
      ) : (
        <>
          <Divider label="Profiles" rightLabel={String(profiles.length)} />
          <Box marginTop={1} flexDirection="column">
            {profiles.map((p, i) => (
              <Box key={p.name}>
                <Text color={i === selectedIndex ? colors.primary : colors.text} bold={i === selectedIndex}>
                  {i === selectedIndex ? '\u25B8 ' : '  '}
                  {p.name.padEnd(20)}
                </Text>
                <Text color={colors.muted}>
                  {p.skills.length} skills
                  {p.description ? ` \u2014 ${truncate(p.description, Math.max(10, width - 34))}` : ''}
                </Text>
              </Box>
            ))}
          </Box>
        </>
      )}

      {busy && (
        <Box marginTop={1}>
          <Spinner label="Applying profile..." />
        </Box>
      )}

      {message && !busy && (
        <Box marginTop={1}>
          <Text
            color={
              messageType === 'success' ? colors.success : messageType === 'warning' ? colors.warning : colors.error
            }
          >
            {truncate(message, width - 2)}
          </Text>
        </Box>
      )}

      <HelpBar
        bindings={[
          { key: 'j/k', action: 'navigate' },
          { key: 'Enter', action: 'apply profile' },
          { key: '?', action: 'help' },
          { key: 'Esc', action: 'back' },
        ]}
      />
    </Box>
  );
}

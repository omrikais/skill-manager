import React, { useState, useCallback, useEffect, createContext } from 'react';
import { render, useApp, useInput, Box } from 'ink';
import { useScreenSize } from 'fullscreen-ink';
import { resolveProjectRoot } from '../fs/paths.js';
import { useSkills } from './hooks/useSkills.js';
import { useDeployments } from './hooks/useDeployments.js';
import { StatusBar } from './components/StatusBar.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { sourcesStepCategory } from './helpData.js';

export const InputActiveContext = createContext(true);
export const ScreenSizeContext = createContext({ height: 24, width: 80 });
import { DashboardScreen } from './screens/DashboardScreen.js';
import { SkillBrowserScreen } from './screens/SkillBrowserScreen.js';
import { SkillDetailScreen } from './screens/SkillDetailScreen.js';
import { ImportWizardScreen } from './screens/ImportWizardScreen.js';
import { SyncResultsScreen } from './screens/SyncResultsScreen.js';
import { ProjectProfileScreen } from './screens/ProjectProfileScreen.js';
import { SourcesScreen } from './screens/SourcesScreen.js';
import { GenerateScreen } from './screens/GenerateScreen.js';
import type { ScreenName } from './theme.js';

const screenDisplayNames: Record<ScreenName, string> = {
  dashboard: 'Dashboard',
  browser: 'Browse',
  detail: 'Detail',
  import: 'Import',
  profiles: 'Profiles',
  sync: 'Sync',
  sources: 'Sources',
  generate: 'Generate',
};

function App() {
  const { exit } = useApp();
  const { height, width } = useScreenSize();
  const { skills, loading: skillsLoading, refresh: refreshSkills } = useSkills();
  const { links, error: linksError, refresh: refreshLinks } = useDeployments();

  const [screen, setScreen] = useState<ScreenName>('dashboard');
  const [previousScreen, setPreviousScreen] = useState<ScreenName>('dashboard');
  const [selectedSkillSlug, setSelectedSkillSlug] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [textInputActive, setTextInputActive] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sourceStep, setSourceStep] = useState('list');

  const navigate = useCallback((s: ScreenName) => {
    setScreen((prev) => {
      setPreviousScreen(prev);
      return s;
    });
  }, []);

  const refreshAll = useCallback(() => {
    refreshSkills();
    refreshLinks();
  }, [refreshSkills, refreshLinks]);

  // Auto-adopt unmanaged skills on TUI launch
  useEffect(() => {
    (async () => {
      try {
        const { autoAdopt } = await import('../core/adopt.js');
        const result = await autoAdopt({ projectRoot: process.cwd(), silent: true, skipDebounce: true });
        if (result.adopted.length > 0) {
          refreshAll();
        }
      } catch {
        // Non-critical
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Global key bindings
  useInput((input, key) => {
    if (showHelp) {
      if (input === '?' || key.escape) setShowHelp(false);
      return;
    }
    if (textInputActive) return;
    if (input === '?') {
      setShowHelp(true);
      return;
    }
    if (input === 'q') {
      exit();
    }
  });

  const projectRoot = resolveProjectRoot(process.cwd());
  const userLinks = links.filter((l) => (l.scope ?? 'user') === 'user');
  const projectLinks = links.filter((l) => l.scope === 'project' && l.projectRoot === projectRoot);

  const userCount = new Set(userLinks.map((l) => l.slug)).size;
  const projectCount = new Set(projectLinks.map((l) => l.slug)).size;

  const screenName = screen === 'detail' && selectedSkillSlug ? selectedSkillSlug : screenDisplayNames[screen];

  const rightLabel = screen === 'detail' && skill() ? `format: ${skill()?.meta.format ?? 'unknown'}` : undefined;

  function skill() {
    return skills.find((s) => s.slug === selectedSkillSlug) ?? null;
  }

  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':
        return (
          <DashboardScreen
            skills={skills}
            links={links}
            linksError={linksError}
            loading={skillsLoading}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onNavigate={navigate}
            onSelectSkill={setSelectedSkillSlug}
            onTextInputChange={setTextInputActive}
          />
        );
      case 'browser':
        return (
          <SkillBrowserScreen
            skills={skills}
            links={links}
            onNavigate={navigate}
            onSelectSkill={setSelectedSkillSlug}
            onRefresh={refreshAll}
            onTextInputChange={setTextInputActive}
          />
        );
      case 'detail':
        return (
          <SkillDetailScreen
            skillSlug={selectedSkillSlug}
            onNavigate={navigate}
            onGoBack={() => navigate(previousScreen)}
            onRefresh={refreshAll}
            onTextInputChange={setTextInputActive}
          />
        );
      case 'import':
        return <ImportWizardScreen onNavigate={navigate} onRefresh={refreshAll} />;
      case 'sync':
        return <SyncResultsScreen onNavigate={navigate} />;
      case 'profiles':
        return <ProjectProfileScreen onNavigate={navigate} onRefresh={refreshAll} />;
      case 'sources':
        return (
          <SourcesScreen
            onNavigate={navigate}
            onRefresh={refreshAll}
            onTextInputChange={setTextInputActive}
            onStepChange={setSourceStep}
          />
        );
      case 'generate':
        return <GenerateScreen onNavigate={navigate} />;
    }
  };

  const screenInputActive = !showHelp;

  return (
    <ScreenSizeContext.Provider value={{ height, width }}>
      <Box flexDirection="column" height={height} width={width}>
        <StatusBar
          screenName={screenName}
          totalSkills={skills.length}
          userCount={userCount}
          projectCount={projectCount}
          rightLabel={rightLabel}
        />
        <InputActiveContext.Provider value={screenInputActive}>
          <Box display={showHelp ? 'none' : 'flex'} flexDirection="column">
            {renderScreen()}
          </Box>
        </InputActiveContext.Provider>
        {showHelp && (
          <HelpOverlay
            screen={screen}
            onClose={() => setShowHelp(false)}
            activeCategory={screen === 'sources' ? sourcesStepCategory[sourceStep] : undefined}
          />
        )}
      </Box>
    </ScreenSizeContext.Provider>
  );
}

export async function launchTUI(): Promise<void> {
  const exitAltScreen = () => process.stdout.write('\x1b[?1049l');

  // Enter alternate screen buffer
  process.stdout.write('\x1b[?1049h');

  // Restore alt screen on any exit path (process.exit, signals, uncaught exceptions).
  // Ink handles its own cleanup (raw mode, cursor, unmount) via signal-exit — we only
  // need to cover the alt-screen escape sequence which Ink doesn't know about.
  process.on('exit', exitAltScreen);

  try {
    const { waitUntilExit } = render(<App />);
    await waitUntilExit();
  } finally {
    exitAltScreen();
    process.removeListener('exit', exitAltScreen);
  }
}

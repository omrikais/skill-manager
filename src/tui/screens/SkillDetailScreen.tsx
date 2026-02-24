import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import path from 'path';
import fs from 'fs-extra';
import { execFileSync } from 'node:child_process';
import { Box, Text, useInput, useStdin } from 'ink';
import { InputActiveContext, ScreenSizeContext } from '../App.js';
import { Spinner } from '@inkjs/ui';
import { loadSkill, deleteSkill, type Skill } from '../../core/skill.js';
import { getLinkRecords, type LinkRecord } from '../../core/state.js';
import { deploy, undeploy, deployToProject, undeployProject, type DeployResult } from '../../deploy/engine.js';
import { readMeta, writeMeta } from '../../core/meta.js';
import { validateLink } from '../../fs/links.js';
import { skillFile, detectProjectContext, resolveProjectRoot } from '../../fs/paths.js';
import { getDirectDeps, buildDepGraph, getDependents } from '../../core/deps.js';
import { parseSkillContent, serializeSkillContent } from '../../core/frontmatter.js';
import { recordVersion } from '../../core/versioning.js';
import { loadConfig } from '../../core/config.js';
import { getEditor, parseEditorCommand } from '../../utils/platform.js';
import { HelpBar } from '../components/HelpBar.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { FrontmatterEditor } from '../components/FrontmatterEditor.js';
import { Divider } from '../components/Divider.js';
import { colors, symbols } from '../theme.js';
import type { ScreenName } from '../theme.js';
import { truncate } from '../utils/truncate.js';

interface SkillDetailScreenProps {
  skillSlug: string;
  onNavigate: (screen: ScreenName) => void;
  onGoBack?: () => void;
  onRefresh: () => void;
  onTextInputChange?: (active: boolean) => void;
}

type ScopeMode = 'user' | 'project';
type Tool = 'cc' | 'codex';
type MessageType = 'success' | 'warning' | 'error';
type Step = 'main' | 'confirm-delete' | 'editing-frontmatter';

export function SkillDetailScreen({
  skillSlug,
  onNavigate,
  onGoBack,
  onRefresh,
  onTextInputChange,
}: SkillDetailScreenProps) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeScope, setActiveScope] = useState<ScopeMode>('user');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('success');
  const [step, setStep] = useState<Step>('main');
  const [directDeps, setDirectDeps] = useState<string[]>([]);
  const [reverseDeps, setReverseDeps] = useState<string[]>([]);
  const [depDeployStatus, setDepDeployStatus] = useState<Record<string, boolean>>({});
  const [linkHealth, setLinkHealth] = useState<Record<string, boolean>>({
    'user:cc': true,
    'user:codex': true,
    'project:cc': true,
    'project:codex': true,
  });

  // Frontmatter editor state
  const [editFields, setEditFields] = useState({ name: '', description: '', tags: '' });
  const [editFieldIndex, setEditFieldIndex] = useState(0);
  const [editingField, setEditingField] = useState(false);

  // Snapshot of the field value before inline editing begins (for Esc revert)
  const fieldSnapshotRef = useRef<string>('');

  // Editor config ref (doesn't need re-render)
  const editorRef = useRef<string>('');
  useEffect(() => {
    loadConfig()
      .then((cfg) => {
        editorRef.current = cfg.editor || getEditor();
      })
      .catch(() => {
        editorRef.current = getEditor();
      });
  }, []);

  const { setRawMode } = useStdin();

  const projectRoot = resolveProjectRoot(process.cwd());
  const projectCtx = detectProjectContext(projectRoot);
  const projectName = path.basename(projectRoot) || projectRoot;
  const hasProjectContext = projectCtx.hasClaudeDir || projectCtx.hasCodexDir;

  const scopeLabel = (scope: ScopeMode): string => (scope === 'user' ? 'User' : `Project (${projectName})`);
  const toolLabel = (tool: Tool): string => (tool === 'cc' ? 'CC' : 'Codex');

  const loadScreenData = useCallback(async () => {
    setLoading(true);
    try {
      const s = await loadSkill(skillSlug);
      const l = await getLinkRecords(skillSlug);
      setSkill(s);
      setLinks(l);

      const nextHealth: Record<string, boolean> = {
        'user:cc': true,
        'user:codex': true,
        'project:cc': true,
        'project:codex': true,
      };

      for (const link of l) {
        const scope = (link.scope ?? 'user') as ScopeMode;
        if (scope === 'project' && link.projectRoot !== projectRoot) continue;
        const status = await validateLink(link.linkPath, link.targetPath);
        nextHealth[`${scope}:${link.tool}`] = status.health === 'healthy';
      }

      setLinkHealth(nextHealth);

      // Load dependency data
      try {
        const deps = await getDirectDeps(skillSlug);
        const graph = await buildDepGraph();
        const revDeps = getDependents(skillSlug, graph);
        setDirectDeps(deps);
        setReverseDeps(revDeps);

        const allDepSlugs = [...new Set([...deps, ...revDeps])];
        const deployStatus: Record<string, boolean> = {};
        for (const slug of allDepSlugs) {
          const depLinks = await getLinkRecords(slug);
          deployStatus[slug] = depLinks.length > 0;
        }
        setDepDeployStatus(deployStatus);
      } catch {
        setDirectDeps([]);
        setReverseDeps([]);
        setDepDeployStatus({});
      }
    } catch (err) {
      setMessageType('error');
      setMessage(`Could not load skill details: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [skillSlug, projectRoot]);

  useEffect(() => {
    void loadScreenData();
  }, [loadScreenData]);

  const userLinks = links.filter((l) => (l.scope ?? 'user') === 'user');
  const projectLinks = links.filter((l) => l.scope === 'project' && l.projectRoot === projectRoot);

  const userCC = userLinks.some((l) => l.tool === 'cc');
  const userCodex = userLinks.some((l) => l.tool === 'codex');
  const projCC = projectLinks.some((l) => l.tool === 'cc');
  const projCodex = projectLinks.some((l) => l.tool === 'codex');

  const refreshLinks = async () => {
    await loadScreenData();
    onRefresh();
  };

  const isToolDeployed = (scope: ScopeMode, tool: Tool): boolean => {
    const source = scope === 'user' ? userLinks : projectLinks;
    return source.some((l) => l.tool === tool);
  };

  const deployTool = async (scope: ScopeMode, tool: Tool): Promise<DeployResult> => {
    if (scope === 'project') {
      return deployToProject(skillSlug, tool, projectRoot);
    }

    const meta = await readMeta(skillSlug);
    const key = tool === 'cc' ? 'cc' : 'codex';
    if (meta.deployAs[key] === 'none') {
      meta.deployAs[key] = 'skill';
      await writeMeta(skillSlug, meta);
    }

    return deploy(skillSlug, tool);
  };

  const undeployTool = async (scope: ScopeMode, tool: Tool): Promise<DeployResult> => {
    return scope === 'project' ? undeployProject(skillSlug, tool, projectRoot) : undeploy(skillSlug, tool);
  };

  const toggleToolInScope = async (scope: ScopeMode, tool: Tool) => {
    const deployed = isToolDeployed(scope, tool);
    const result = deployed ? await undeployTool(scope, tool) : await deployTool(scope, tool);

    const scopeText = scopeLabel(scope);
    const toolText = toolLabel(tool);

    if (result.action === 'deployed') {
      setMessageType('success');
      setMessage(`Deployed ${toolText} in ${scopeText} scope.`);
    } else if (result.action === 'undeployed') {
      setMessageType('success');
      setMessage(`Removed ${toolText} from ${scopeText} scope.`);
    } else {
      setMessageType('warning');
      if (deployed) {
        setMessage(`${toolText} is already not deployed in ${scopeText} scope.`);
      } else {
        setMessage(`No deployment change for ${toolText} in ${scopeText} scope.`);
      }
    }

    await refreshLinks();
  };

  const applyScopeAction = async (scope: ScopeMode, action: 'deploy' | 'remove') => {
    const tools: Tool[] = ['cc', 'codex'];
    let changed = 0;
    let unchanged = 0;

    for (const tool of tools) {
      const currentlyDeployed = isToolDeployed(scope, tool);
      if (action === 'deploy' && currentlyDeployed) {
        unchanged++;
        continue;
      }
      if (action === 'remove' && !currentlyDeployed) {
        unchanged++;
        continue;
      }

      const result = action === 'deploy' ? await deployTool(scope, tool) : await undeployTool(scope, tool);

      const expected = action === 'deploy' ? 'deployed' : 'undeployed';
      if (result.action === expected) {
        changed++;
      } else {
        unchanged++;
      }
    }

    await refreshLinks();

    const scopeText = scopeLabel(scope);
    setMessageType(changed > 0 ? 'success' : 'warning');
    if (action === 'deploy') {
      setMessage(
        `Deployed ${changed}/${tools.length} tools in ${scopeText} scope${unchanged > 0 ? `; ${unchanged} unchanged.` : '.'}`,
      );
    } else {
      setMessage(
        `Removed ${changed}/${tools.length} tools from ${scopeText} scope${unchanged > 0 ? `; ${unchanged} unchanged.` : '.'}`,
      );
    }
  };

  const switchScope = () => {
    setActiveScope((prev) => (prev === 'user' ? 'project' : 'user'));
  };

  const launchExternalEditor = () => {
    const editor = editorRef.current || getEditor();
    const file = skillFile(skillSlug);
    const [cmd, ...args] = parseEditorCommand(editor);

    try {
      setRawMode(false);
      process.stdout.write('\x1b[?1049l');
      execFileSync(cmd, [...args, file], { stdio: 'inherit', shell: process.platform === 'win32' });
    } catch (err) {
      setMessageType('error');
      setMessage(`Editor failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      process.stdout.write('\x1b[?1049h');
      setRawMode(true);
    }

    void recordVersion(skillSlug, 'edited').catch(() => {
      /* Non-critical */
    });
    void loadScreenData();
  };

  const enterFrontmatterEditor = () => {
    if (!skill) return;
    setEditFields({
      name: skill.name ?? '',
      description: skill.description ?? '',
      tags: skill.tags.join(', '),
    });
    setEditFieldIndex(0);
    setEditingField(false);
    setStep('editing-frontmatter');
  };

  const saveFrontmatter = async () => {
    try {
      const file = skillFile(skillSlug);
      const raw = await fs.readFile(file, 'utf-8');
      const parsed = parseSkillContent(raw);
      const updatedFm = {
        ...parsed.frontmatter,
        name: editFields.name || undefined,
        description: editFields.description || undefined,
        tags: editFields.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const serialized = serializeSkillContent(updatedFm, parsed.content);
      await fs.writeFile(file, serialized, 'utf-8');

      try {
        await recordVersion(skillSlug, 'edited frontmatter');
      } catch {
        // Non-critical
      }

      await loadScreenData();
      setStep('main');
      setMessageType('success');
      setMessage('Frontmatter saved.');
    } catch (err) {
      setMessageType('error');
      setMessage(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      setStep('main');
    }
  };

  const inputActive = useContext(InputActiveContext);
  const { width } = useContext(ScreenSizeContext);

  useInput(
    (input, key) => {
      // Confirm-delete step: y to confirm, n/Esc to cancel
      if (step === 'confirm-delete') {
        if (input === 'y') {
          setStep('main');
          void (async () => {
            try {
              await deleteSkill(skillSlug);
              onRefresh();
              onNavigate('dashboard');
            } catch (err) {
              setMessageType('error');
              setMessage(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          })();
        }
        if (input === 'n' || key.escape) {
          setStep('main');
        }
        return;
      }

      // Frontmatter editing step
      if (step === 'editing-frontmatter') {
        if (editingField) {
          // TextInput is active — only handle Esc to revert and cancel field edit
          if (key.escape) {
            const fieldKey = (['name', 'description', 'tags'] as const)[editFieldIndex];
            setEditFields((prev) => ({ ...prev, [fieldKey]: fieldSnapshotRef.current }));
            setEditingField(false);
            onTextInputChange?.(false);
          }
          // Everything else handled by TextInput
          return;
        }

        // Navigating fields
        if (input === 'j' || key.downArrow) {
          setEditFieldIndex((i) => Math.min(i + 1, 2));
          return;
        }
        if (input === 'k' || key.upArrow) {
          setEditFieldIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (key.return) {
          const fieldKey = (['name', 'description', 'tags'] as const)[editFieldIndex];
          fieldSnapshotRef.current = editFields[fieldKey];
          setEditingField(true);
          onTextInputChange?.(true);
          return;
        }
        if (input === 's') {
          void saveFrontmatter();
          return;
        }
        if (key.escape) {
          setStep('main');
          setMessage('');
          return;
        }
        return;
      }

      // Main step
      if (key.escape) {
        if (onGoBack) onGoBack();
        else onNavigate('dashboard');
      }
      if (key.tab) switchScope();
      if (input === 'u') setActiveScope('user');
      if (input === 'p') setActiveScope('project');
      if (input === 'c') void toggleToolInScope(activeScope, 'cc');
      if (input === 'x') void toggleToolInScope(activeScope, 'codex');
      if (input === '+') void applyScopeAction(activeScope, 'deploy');
      if (input === '-') void applyScopeAction(activeScope, 'remove');
      if (input === 'D') {
        setStep('confirm-delete');
      }
      if (input === 'e') {
        launchExternalEditor();
      }
      if (input === 'E') {
        enterFrontmatterEditor();
      }
    },
    { isActive: inputActive },
  );

  if (loading) {
    return <Spinner label={`Loading ${skillSlug}...`} />;
  }

  if (!skill) {
    return <Text color={colors.error}>Skill not found: {skillSlug}</Text>;
  }

  if (step === 'confirm-delete') {
    return (
      <ConfirmDialog
        title={`Delete "${skillSlug}" permanently?`}
        message="This will undeploy from all tools/scopes and remove the skill from the canonical store."
        warning={reverseDeps.length > 0 ? `Other skills depend on this: ${reverseDeps.join(', ')}` : undefined}
        confirmLabel="delete"
        danger
      />
    );
  }

  if (step === 'editing-frontmatter') {
    return (
      <FrontmatterEditor
        fields={editFields}
        fieldIndex={editFieldIndex}
        editingField={editingField}
        onFieldChange={(field, value) => {
          setEditFields((prev) => ({ ...prev, [field]: value }));
        }}
        onFieldSubmit={() => {
          setEditingField(false);
          onTextInputChange?.(false);
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      {skill.description && (
        <Box marginTop={1}>
          <Text color={colors.muted}>{skill.description}</Text>
        </Box>
      )}

      <Divider label="Deployments" />

      <Box marginTop={1} gap={2}>
        <ScopeStateCard
          label="User"
          ccDeployed={userCC}
          codexDeployed={userCodex}
          ccHealthy={linkHealth['user:cc']}
          codexHealthy={linkHealth['user:codex']}
          active={activeScope === 'user'}
        />
        <ScopeStateCard
          label={`Project (${projectName})`}
          ccDeployed={projCC}
          codexDeployed={projCodex}
          ccHealthy={linkHealth['project:cc']}
          codexHealthy={linkHealth['project:codex']}
          active={activeScope === 'project'}
        />
      </Box>

      <Box marginTop={1} gap={2}>
        <Box minWidth={30}>
          <Text color={activeScope === 'user' ? colors.primary : colors.dim}>
            {activeScope === 'user' ? `${symbols.selected} User (active)` : '  User'}
          </Text>
        </Box>
        <Box minWidth={30}>
          <Text color={activeScope === 'project' ? colors.primary : colors.dim}>
            {activeScope === 'project' ? `${symbols.selected} Project (active)` : '  Project'}
          </Text>
        </Box>
      </Box>

      {!hasProjectContext && activeScope === 'project' && (
        <Box marginTop={1}>
          <Text color={colors.warning}>
            Project scope is not initialized yet. Deploying here will create .claude/skills and/or .agents/skills.
          </Text>
        </Box>
      )}

      <Divider label="Info" />

      <Box marginTop={1} gap={2}>
        <Text color={colors.muted}>Tags: {truncate(skill.tags.join(', ') || 'none', Math.max(10, width - 40))}</Text>
        <Text color={colors.muted}>Source: {skill.meta.source.type}</Text>
        <Text color={colors.muted}>Format: {skill.meta.format}</Text>
      </Box>
      {skill.meta.source.repo && (
        <Box>
          <Text color={colors.muted}>
            Repo: <Text color={colors.accent}>{skill.meta.source.repo}</Text>
          </Text>
        </Box>
      )}

      {(directDeps.length > 0 || reverseDeps.length > 0) && (
        <>
          <Divider label="Dependencies" />
          {directDeps.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text color={colors.text} bold>
                Requires
              </Text>
              {directDeps.map((slug) => (
                <DepRow key={slug} slug={slug} deployed={depDeployStatus[slug] ?? false} />
              ))}
            </Box>
          )}
          {reverseDeps.length > 0 && (
            <Box marginTop={directDeps.length > 0 ? 0 : 1} flexDirection="column">
              <Text color={colors.text} bold>
                Required by
              </Text>
              {reverseDeps.map((slug) => (
                <DepRow key={slug} slug={slug} deployed={depDeployStatus[slug] ?? false} />
              ))}
            </Box>
          )}
        </>
      )}

      {message && (
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
          { key: 'Tab', action: 'switch scope' },
          { key: 'c/x', action: 'toggle CC/Codex' },
          { key: '+', action: 'deploy all' },
          { key: '-', action: 'remove all' },
          { key: 'e/E', action: 'edit' },
          { key: 'D', action: 'delete' },
          { key: '?', action: 'help' },
          { key: 'Esc', action: 'back' },
        ]}
      />
    </Box>
  );
}

function ScopeStateCard({
  label,
  ccDeployed,
  codexDeployed,
  ccHealthy,
  codexHealthy,
  active,
}: {
  label: string;
  ccDeployed: boolean;
  codexDeployed: boolean;
  ccHealthy: boolean;
  codexHealthy: boolean;
  active: boolean;
}) {
  return (
    <Box
      borderStyle="round"
      borderColor={active ? colors.primary : colors.border}
      paddingX={1}
      flexDirection="column"
      minWidth={30}
    >
      <Text color={colors.text} bold>
        {label}
      </Text>
      <ToolState tool="cc" deployed={ccDeployed} healthy={ccHealthy} />
      <ToolState tool="codex" deployed={codexDeployed} healthy={codexHealthy} />
    </Box>
  );
}

function DepRow({ slug, deployed }: { slug: string; deployed: boolean }) {
  const icon = deployed ? symbols.deployed : symbols.notDeployed;
  const color = deployed ? colors.success : colors.dim;
  const label = deployed ? 'deployed' : 'not deployed';
  return (
    <Text color={color}>
      {`  ${icon} ${slug}  `}
      <Text color={colors.dim}>{label}</Text>
    </Text>
  );
}

function ToolState({ tool, deployed, healthy }: { tool: Tool; deployed: boolean; healthy: boolean }) {
  const toolName = tool === 'cc' ? 'CC' : 'Codex';
  const toolColor = tool === 'cc' ? colors.cc : colors.codex;
  const icon = deployed ? (healthy ? symbols.deployed : symbols.broken) : symbols.notDeployed;
  const state = deployed ? (healthy ? 'deployed' : 'broken') : 'not deployed';

  return (
    <Text color={deployed ? (healthy ? toolColor : colors.error) : colors.muted}>
      {`  ${icon} ${toolName.padEnd(6)} ${state}`}
    </Text>
  );
}

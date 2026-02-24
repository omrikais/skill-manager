import { describe, it, expect } from 'vitest';
import { deployTargetDir, deployLinkPath, type ToolName, type DeployFormat } from '../../src/fs/paths.js';

describe('deployTargetDir', () => {
  it('skill + cc → CC_SKILLS_DIR', () => {
    const dir = deployTargetDir('cc', 'skill');
    expect(dir).toMatch(/\.claude\/skills$/);
  });

  it('skill + codex → CODEX_SKILLS_DIR', () => {
    const dir = deployTargetDir('codex', 'skill');
    expect(dir).toMatch(/\.agents\/skills$/);
  });

  it('legacy-command + cc → CC_COMMANDS_DIR', () => {
    const dir = deployTargetDir('cc', 'legacy-command');
    expect(dir).toMatch(/\.claude\/commands$/);
  });

  it('legacy-command + codex → null', () => {
    expect(deployTargetDir('codex', 'legacy-command')).toBeNull();
  });

  it('legacy-prompt + codex → CODEX_PROMPTS_DIR', () => {
    const dir = deployTargetDir('codex', 'legacy-prompt');
    expect(dir).toMatch(/\.codex\/prompts$/);
  });

  it('legacy-prompt + cc → null', () => {
    expect(deployTargetDir('cc', 'legacy-prompt')).toBeNull();
  });

  it('none + cc → null', () => {
    expect(deployTargetDir('cc', 'none')).toBeNull();
  });

  it('none + codex → null', () => {
    expect(deployTargetDir('codex', 'none')).toBeNull();
  });
});

describe('deployLinkPath', () => {
  it('skill format uses directory path (no .md)', () => {
    const lp = deployLinkPath('cc', 'skill', 'my-skill');
    expect(lp).toMatch(/\.claude\/skills\/my-skill$/);
    expect(lp).not.toMatch(/\.md$/);
  });

  it('legacy-command uses flat .md file', () => {
    const lp = deployLinkPath('cc', 'legacy-command', 'my-skill');
    expect(lp).toMatch(/\.claude\/commands\/my-skill\.md$/);
  });

  it('legacy-prompt uses flat .md file', () => {
    const lp = deployLinkPath('codex', 'legacy-prompt', 'my-skill');
    expect(lp).toMatch(/\.codex\/prompts\/my-skill\.md$/);
  });

  it('returns null for invalid combos', () => {
    expect(deployLinkPath('codex', 'legacy-command', 'x')).toBeNull();
    expect(deployLinkPath('cc', 'legacy-prompt', 'x')).toBeNull();
    expect(deployLinkPath('cc', 'none', 'x')).toBeNull();
  });
});

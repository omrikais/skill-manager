import { z } from 'zod';

// ─── Generate target & mode ──────────────────────────────────

export type GenerateTarget = 'claude-md' | 'agents-md';
export type GenerateMode = 'inline' | 'reference' | 'summary';
export type SymlinkMode = 'claude-to-agents' | 'agents-to-claude' | 'none';

// ─── Section names ───────────────────────────────────────────

export const SECTION_NAMES = [
  'identity',
  'commands',
  'architecture',
  'conventions',
  'safety',
  'testing',
  'gotchas',
  'skills',
  'mcp',
  'tool-specific',
] as const;

export type SectionName = (typeof SECTION_NAMES)[number];

// ─── Generated section ───────────────────────────────────────

export interface GeneratedSection {
  name: SectionName;
  title: string;
  content: string;
}

// ─── Project facts (raw, zero inference) ─────────────────────

export interface PackageJson {
  name?: string;
  description?: string;
  version?: string;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
  engines?: Record<string, string>;
}

export interface TsConfig {
  compilerOptions?: Record<string, unknown>;
  include?: string[];
  exclude?: string[];
}

export type LockfileType = 'bun' | 'pnpm' | 'yarn' | 'npm';

export interface GitInfo {
  remoteUrl?: string;
  branch?: string;
}

export interface ProjectFacts {
  projectRoot: string;
  packageJson: PackageJson | null;
  tsconfig: TsConfig | null;
  lockfileType: LockfileType | null;
  readmeHead: string[] | null;
  existingClaudeMd: string | null;
  existingAgentsMd: string | null;
  git: GitInfo | null;
  files: string[];
  dirs: string[];
  languages: string[];
  presenceFlags: {
    dockerfile: boolean;
    githubWorkflows: boolean;
    makefile: boolean;
    eslint: boolean;
    prettier: boolean;
    vitest: boolean;
    jest: boolean;
    husky: boolean;
    envExample: boolean;
    turbo: boolean;
    nx: boolean;
    lerna: boolean;
  };
}

// ─── Project metadata (inferred) ─────────────────────────────

export interface CommandInfo {
  name: string;
  command: string;
  description: string;
}

export interface ArchEntry {
  path: string;
  purpose: string;
}

export interface TestInfo {
  framework: string | null;
  dirs: string[];
  configFile: string | null;
}

export interface ProjectMeta {
  projectName: string;
  oneLiner: string | null;
  stack: string[];
  packageManager: string | null;
  isEsm: boolean;
  commands: CommandInfo[];
  architecture: ArchEntry[];
  conventions: string[];
  safetyRules: string[];
  testInfo: TestInfo;
  gotchas: string[];
}

// ─── Section build options ───────────────────────────────────

export interface SectionBuildOptions {
  includeSkills: boolean;
  withMcp: boolean;
  skills?: Array<{ slug: string; name: string; description: string; triggers?: { files?: string[]; dirs?: string[] } }>;
}

// ─── Generate config (.sm-generate.toml) ─────────────────────

export const GenerateConfigSchema = z.object({
  target: z.enum(['claude-md', 'agents-md', 'both']).optional(),
  mode: z.enum(['inline', 'reference', 'summary']).optional(),
  symlink: z.enum(['claude-to-agents', 'agents-to-claude', 'none']).optional(),

  identity: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
  }).optional(),

  commands: z.object({
    build: z.string().optional(),
    test: z.string().optional(),
    lint: z.string().optional(),
    dev: z.string().optional(),
    extras: z.record(z.string()).optional(),
  }).passthrough().optional(),

  architecture: z.object({
    exclude: z.array(z.string()).optional(),
    extras: z.record(z.string()).optional(),
  }).optional(),

  conventions: z.object({
    extras: z.array(z.string()).optional(),
  }).optional(),

  safety: z.object({
    extras: z.array(z.string()).optional(),
  }).optional(),

  gotchas: z.object({
    extras: z.array(z.string()).optional(),
  }).optional(),
}).passthrough();

export type GenerateConfig = z.infer<typeof GenerateConfigSchema>;

// ─── CLI options ─────────────────────────────────────────────

export interface GenerateOptions {
  target: GenerateTarget | 'both';
  mode: GenerateMode;
  includeSkills: boolean;
  withMcp: boolean;
  strict: boolean;
  section?: SectionName;
  dryRun: boolean;
  write: boolean;
  symlink?: SymlinkMode;
  projectRoot: string;
}

// ─── Merge result ────────────────────────────────────────────

export interface MergeResult {
  content: string;
  sectionsUpdated: string[];
  sectionsPreserved: string[];
  sectionsAppended: string[];
  userContentPreserved: boolean;
}

// ─── Generate result ─────────────────────────────────────────

export interface GenerateResult {
  target: GenerateTarget;
  filePath: string;
  mergeResult: MergeResult;
  written: boolean;
}

export interface GenerateOutput {
  results: GenerateResult[];
  effectiveSymlink: SymlinkMode;
}

import path from 'path';
import type {
  ProjectFacts,
  ProjectMeta,
  CommandInfo,
  ArchEntry,
  TestInfo,
  GenerateConfig,
} from './types.js';

/**
 * Pure function: infer structured metadata from raw project facts.
 * Config overrides are applied at each inference step.
 */
export function inferProjectMeta(facts: ProjectFacts, config?: GenerateConfig | null): ProjectMeta {
  return {
    projectName: inferProjectName(facts, config),
    oneLiner: inferOneLiner(facts, config),
    stack: inferStack(facts),
    packageManager: inferPackageManager(facts),
    isEsm: inferIsEsm(facts),
    commands: inferCommands(facts, config),
    architecture: inferArchitecture(facts, config),
    conventions: inferConventions(facts, config),
    safetyRules: inferSafetyRules(facts, config),
    testInfo: inferTestInfo(facts),
    gotchas: inferGotchas(facts, config),
  };
}

function inferProjectName(facts: ProjectFacts, config?: GenerateConfig | null): string {
  if (config?.identity?.name) return config.identity.name;
  if (facts.packageJson?.name) return facts.packageJson.name;
  return path.basename(facts.projectRoot);
}

function inferOneLiner(facts: ProjectFacts, config?: GenerateConfig | null): string | null {
  if (config?.identity?.description) return config.identity.description;
  if (facts.packageJson?.description) return facts.packageJson.description;

  // Try first non-heading, non-empty line from README
  if (facts.readmeHead) {
    for (const line of facts.readmeHead) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('![')) {
        return trimmed;
      }
    }
  }

  return null;
}

const DEP_TO_STACK: Record<string, string> = {
  react: 'React',
  'react-dom': 'React',
  next: 'Next.js',
  vue: 'Vue',
  nuxt: 'Nuxt',
  svelte: 'Svelte',
  '@sveltejs/kit': 'SvelteKit',
  angular: 'Angular',
  '@angular/core': 'Angular',
  express: 'Express',
  fastify: 'Fastify',
  koa: 'Koa',
  hono: 'Hono',
  'hono/hono': 'Hono',
  nestjs: 'NestJS',
  '@nestjs/core': 'NestJS',
  prisma: 'Prisma',
  '@prisma/client': 'Prisma',
  drizzle: 'Drizzle',
  'drizzle-orm': 'Drizzle',
  tailwindcss: 'Tailwind CSS',
  ink: 'Ink',
  electron: 'Electron',
  'react-native': 'React Native',
  vite: 'Vite',
  webpack: 'webpack',
  esbuild: 'esbuild',
  tsup: 'tsup',
  rollup: 'Rollup',
  commander: 'Commander.js',
  zod: 'Zod',
};

const LANGUAGE_DISPLAY: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  ruby: 'Ruby',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  php: 'PHP',
  elixir: 'Elixir',
  zig: 'Zig',
  lua: 'Lua',
  shell: 'Shell',
};

function inferStack(facts: ProjectFacts): string[] {
  const stack = new Set<string>();

  // Languages
  for (const lang of facts.languages) {
    const display = LANGUAGE_DISPLAY[lang];
    if (display) stack.add(display);
  }

  // Dependencies
  const allDeps = {
    ...facts.packageJson?.dependencies,
    ...facts.packageJson?.devDependencies,
  };
  for (const [dep, label] of Object.entries(DEP_TO_STACK)) {
    if (dep in allDeps) stack.add(label);
  }

  return [...stack];
}

function inferPackageManager(facts: ProjectFacts): string | null {
  if (facts.lockfileType) return facts.lockfileType;
  if (facts.packageJson) return 'npm'; // default if package.json exists
  return null;
}

function inferIsEsm(facts: ProjectFacts): boolean {
  return facts.packageJson?.type === 'module';
}

const SCRIPT_DESCRIPTIONS: Record<string, string> = {
  build: 'Build the project',
  dev: 'Start development server',
  start: 'Start the application',
  test: 'Run tests',
  lint: 'Run linter',
  format: 'Format code',
  typecheck: 'Type-check without emitting',
  'type-check': 'Type-check without emitting',
  clean: 'Clean build artifacts',
  preview: 'Preview production build',
  deploy: 'Deploy the application',
  generate: 'Run code generation',
  migrate: 'Run database migrations',
  seed: 'Seed the database',
  'db:push': 'Push database schema',
  'db:migrate': 'Run database migrations',
  prepare: 'Prepare (husky, etc.)',
};

const COMMAND_PRIORITY: Record<string, number> = {
  build: 0,
  dev: 1,
  start: 2,
  test: 3,
  lint: 4,
  format: 5,
  typecheck: 6,
  'type-check': 6,
  clean: 7,
};

function inferCommands(facts: ProjectFacts, config?: GenerateConfig | null): CommandInfo[] {
  const pm = inferPackageManager(facts) ?? 'npm';
  const run = pm === 'npm' ? 'npm run' : pm;
  const scripts = facts.packageJson?.scripts ?? {};
  const commands: CommandInfo[] = [];

  for (const [name, _script] of Object.entries(scripts)) {
    // Apply config overrides
    const overrideCommand = config?.commands?.[name as keyof typeof config.commands];
    const command = typeof overrideCommand === 'string' ? overrideCommand : `${run} ${name}`;
    const description = SCRIPT_DESCRIPTIONS[name] ?? name;
    commands.push({ name, command, description });
  }

  // Add config extras
  if (config?.commands?.extras && typeof config.commands.extras === 'object') {
    for (const [name, command] of Object.entries(config.commands.extras)) {
      if (typeof command === 'string' && !commands.some((c) => c.name === name)) {
        commands.push({ name, command, description: name });
      }
    }
  }

  // Sort by priority (known scripts first, then alphabetical)
  commands.sort((a, b) => {
    const pa = COMMAND_PRIORITY[a.name] ?? 100;
    const pb = COMMAND_PRIORITY[b.name] ?? 100;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return commands;
}

const DIR_PURPOSE: Record<string, string> = {
  src: 'Source code',
  lib: 'Library code',
  app: 'Application entry / routes',
  pages: 'Page components / routes',
  components: 'UI components',
  hooks: 'React hooks',
  utils: 'Utility functions',
  helpers: 'Helper functions',
  types: 'Type definitions',
  models: 'Data models',
  services: 'Service layer',
  api: 'API routes / handlers',
  routes: 'Route definitions',
  controllers: 'Controllers',
  middleware: 'Middleware',
  config: 'Configuration',
  scripts: 'Scripts',
  tools: 'Tooling',
  bin: 'CLI entry points',
  cmd: 'CLI commands',
  pkg: 'Packages',
  packages: 'Monorepo packages',
  apps: 'Monorepo applications',
  internal: 'Internal packages',
  core: 'Core business logic',
  deploy: 'Deployment',
  infra: 'Infrastructure',
  terraform: 'Terraform infrastructure',
  docker: 'Docker configuration',
  docs: 'Documentation',
  public: 'Static assets',
  static: 'Static files',
  assets: 'Assets',
  styles: 'Stylesheets',
  tests: 'Tests',
  test: 'Tests',
  __tests__: 'Tests',
  spec: 'Test specs',
  e2e: 'End-to-end tests',
  fixtures: 'Test fixtures',
  mocks: 'Test mocks',
  migrations: 'Database migrations',
  seeds: 'Database seeds',
  prisma: 'Prisma schema & migrations',
  templates: 'Templates',
  views: 'View templates',
  layouts: 'Layout templates',
  plugins: 'Plugins',
  extensions: 'Extensions',
  locales: 'Translations / i18n',
  i18n: 'Internationalization',
};

function inferArchitecture(facts: ProjectFacts, config?: GenerateConfig | null): ArchEntry[] {
  const excludeSet = new Set(config?.architecture?.exclude ?? []);
  const entries: ArchEntry[] = [];

  // Top-level dirs only (not nested ones from fast-glob)
  const topDirs = facts.dirs
    .filter((d) => !d.includes('/'))
    .filter((d) => !excludeSet.has(d))
    .filter((d) => !d.startsWith('.'));

  for (const dir of topDirs) {
    const purpose = DIR_PURPOSE[dir];
    if (purpose) {
      entries.push({ path: `${dir}/`, purpose });
    }
  }

  // Also add src subdirs if src exists
  const srcSubdirs = facts.dirs
    .filter((d) => d.startsWith('src/') && d.split('/').length === 2)
    .filter((d) => !excludeSet.has(d));

  for (const dir of srcSubdirs) {
    const basename = dir.split('/')[1];
    const purpose = DIR_PURPOSE[basename];
    if (purpose && !entries.some((e) => e.path === `${dir}/`)) {
      entries.push({ path: `${dir}/`, purpose });
    }
  }

  // Add config extras
  if (config?.architecture?.extras) {
    for (const [p, purpose] of Object.entries(config.architecture.extras)) {
      if (!entries.some((e) => e.path === p)) {
        entries.push({ path: p, purpose });
      }
    }
  }

  return entries;
}

function inferConventions(facts: ProjectFacts, config?: GenerateConfig | null): string[] {
  const conventions: string[] = [];

  if (inferIsEsm(facts)) {
    conventions.push('ESM-only (`"type": "module"`)');
  }

  if (facts.tsconfig?.compilerOptions) {
    const opts = facts.tsconfig.compilerOptions;
    if (opts.strict === true) {
      conventions.push('TypeScript strict mode enabled');
    }
    if (opts.moduleResolution === 'bundler') {
      conventions.push('TypeScript bundler module resolution');
    }
    if (opts.module === 'nodenext' || opts.module === 'node16') {
      conventions.push(`TypeScript \`${opts.module}\` module system — use \`.js\` extensions in imports`);
    }
  }

  if (facts.presenceFlags.eslint) {
    conventions.push('ESLint for linting');
  }
  if (facts.presenceFlags.prettier) {
    conventions.push('Prettier for formatting');
  }

  // Append user extras
  if (config?.conventions?.extras) {
    conventions.push(...config.conventions.extras);
  }

  return conventions;
}

function inferSafetyRules(facts: ProjectFacts, config?: GenerateConfig | null): string[] {
  const rules: string[] = [];

  if (facts.presenceFlags.envExample) {
    rules.push('Never commit `.env` files — use `.env.example` as template');
  }

  if (facts.lockfileType) {
    const lockfiles: Record<string, string> = {
      bun: 'bun.lockb',
      pnpm: 'pnpm-lock.yaml',
      yarn: 'yarn.lock',
      npm: 'package-lock.json',
    };
    const name = lockfiles[facts.lockfileType];
    rules.push(`Do not manually edit \`${name}\` — use the package manager`);
  }

  if (facts.presenceFlags.husky) {
    rules.push('Do not skip git hooks (`--no-verify`)');
  }

  if (facts.presenceFlags.githubWorkflows) {
    rules.push('Do not modify CI workflow files without review');
  }

  // Append user extras
  if (config?.safety?.extras) {
    rules.push(...config.safety.extras);
  }

  return rules;
}

function inferTestInfo(facts: ProjectFacts): TestInfo {
  let framework: string | null = null;
  let configFile: string | null = null;
  const dirs: string[] = [];

  if (facts.presenceFlags.vitest) {
    framework = 'Vitest';
    configFile = facts.files.find((f) => f.startsWith('vitest.config.')) ?? null;
  } else if (facts.presenceFlags.jest) {
    framework = 'Jest';
    configFile = facts.files.find((f) => f.startsWith('jest.config.')) ?? null;
  } else {
    // Check deps
    const allDeps = {
      ...facts.packageJson?.dependencies,
      ...facts.packageJson?.devDependencies,
    };
    if ('vitest' in allDeps) framework = 'Vitest';
    else if ('jest' in allDeps) framework = 'Jest';
    else if ('mocha' in allDeps) framework = 'Mocha';
    else if ('ava' in allDeps) framework = 'AVA';
    else if ('tap' in allDeps) framework = 'tap';
  }

  // Detect test directories
  const testDirNames = ['tests', 'test', '__tests__', 'spec', 'e2e'];
  for (const d of testDirNames) {
    if (facts.dirs.some((dir) => dir === d || dir.startsWith(`${d}/`))) {
      dirs.push(d);
    }
  }

  return { framework, dirs, configFile };
}

function inferGotchas(facts: ProjectFacts, config?: GenerateConfig | null): string[] {
  const gotchas: string[] = [];

  if (inferIsEsm(facts) && facts.languages.includes('typescript')) {
    gotchas.push('ESM + TypeScript: all imports must use `.js` extensions (even for `.ts` files)');
  }

  if (facts.presenceFlags.turbo || facts.presenceFlags.nx || facts.presenceFlags.lerna) {
    gotchas.push('Monorepo: changes may affect multiple packages — check dependency graph');
  }

  if (facts.packageJson?.engines) {
    const node = facts.packageJson.engines.node;
    if (node) {
      gotchas.push(`Requires Node.js ${node}`);
    }
  }

  // Append user extras
  if (config?.gotchas?.extras) {
    gotchas.push(...config.gotchas.extras);
  }

  return gotchas;
}

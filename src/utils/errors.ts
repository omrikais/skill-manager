export class SmError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SmError';
  }
}

export class SkillNotFoundError extends SmError {
  constructor(name: string) {
    super(`Skill not found: ${name}`, 'SKILL_NOT_FOUND');
  }
}

export class SkillExistsError extends SmError {
  constructor(name: string) {
    super(`Skill already exists: ${name}`, 'SKILL_EXISTS');
  }
}

export class LinkError extends SmError {
  constructor(message: string) {
    super(message, 'LINK_ERROR');
  }
}

export class ConfigError extends SmError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
  }
}

export class ManifestError extends SmError {
  constructor(message: string) {
    super(message, 'MANIFEST_ERROR');
  }
}

export class InvalidSlugError extends SmError {
  constructor(slug: string) {
    super(`Invalid skill name: "${slug}"`, 'INVALID_SLUG');
  }
}

export class UsageError extends SmError {
  constructor(message: string) {
    super(message, 'USAGE_ERROR');
  }
}

export class CyclicDependencyError extends SmError {
  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' → ')}`, 'CYCLIC_DEPENDENCY');
  }
}

export class SourceError extends SmError {
  constructor(message: string) {
    super(message, 'SOURCE_ERROR');
  }
}

export class SourceNotFoundError extends SmError {
  constructor(name: string) {
    super(`Source not found: ${name}`, 'SOURCE_NOT_FOUND');
  }
}

export class PackNotFoundError extends SmError {
  constructor(name: string) {
    super(`Pack not found: ${name}`, 'PACK_NOT_FOUND');
  }
}

export class GenerateError extends SmError {
  constructor(message: string) {
    super(message, 'GENERATE_ERROR');
  }
}

export function validateSlug(raw: string): void {
  if (!raw || raw.includes('..') || raw.includes('/') || raw.includes('\\')) {
    throw new InvalidSlugError(raw);
  }
  // Import slugify inline to avoid circular deps at module level
  const slugified = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slugified) {
    throw new InvalidSlugError(raw);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorHandler<T extends (...args: any[]) => Promise<void>>(fn: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof SmError) {
        console.error(`Error [${err.code}]: ${err.message}`);
      } else if (err instanceof Error && err.name === 'ZodError') {
        const zodErr = err as Error & { issues?: Array<{ path: (string | number)[]; message: string }> };
        const details = zodErr.issues?.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n') ?? err.message;
        console.error(`Data validation error:\n${details}`);
      } else if (err instanceof SyntaxError) {
        console.error(`Could not parse data file: ${err.message}`);
      } else if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EACCES') {
        const filepath = (err as NodeJS.ErrnoException & { path?: string }).path ?? '';
        console.error(`Permission denied: ${filepath || err.message}\nTry: chmod -R u+rw ~/.skill-manager`);
      } else if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        const path = (err as NodeJS.ErrnoException & { path?: string }).path ?? '';
        console.error(`File not found: ${path || err.message}`);
      } else if (err instanceof Error) {
        console.error(`Unexpected error: ${err.message}`);
      } else {
        console.error(`Unexpected error: ${err}`);
      }
      process.exit(1);
    }
  }) as T;
}

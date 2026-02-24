import matter from 'gray-matter';
import { z } from 'zod';

export const FrontmatterSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).default([]),
  tools: z.array(z.enum(['cc', 'codex'])).optional(),
}).passthrough();

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

export interface ParsedSkillContent {
  frontmatter: Frontmatter;
  content: string;
  raw: string;
}

export function parseSkillContent(raw: string): ParsedSkillContent {
  const { data, content } = matter(raw);
  const frontmatter = FrontmatterSchema.parse(data);
  return { frontmatter, content: content.trim(), raw };
}

export function serializeSkillContent(frontmatter: Frontmatter, content: string): string {
  return matter.stringify(content, frontmatter);
}

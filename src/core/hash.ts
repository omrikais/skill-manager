import crypto from 'crypto';
import fs from 'fs-extra';

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

export async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  return hashContent(content);
}

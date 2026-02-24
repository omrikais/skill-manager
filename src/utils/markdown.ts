import { marked, type MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  // marked-terminal types lag behind marked v15 — runtime API is stable
  marked.use(markedTerminal({
    reflowText: false,
    showSectionPrefix: false,
    tab: 2,
    width: process.stdout.columns || 80,
    unescape: true,
    emoji: true,
  }) as MarkedExtension);

  // Fix: marked-terminal's text() handler extracts raw text instead of parsing
  // inline tokens (strong, codespan, etc.), breaking formatting inside list items.
  // Override to call parseInline() like paragraph() does.
  marked.use({
    renderer: {
      text(token: unknown) {
        if (typeof token === 'object' && token !== null) {
          const t = token as { tokens?: unknown[]; text?: string };
          if (t.tokens) {
            return this.parser.parseInline(t.tokens as Parameters<typeof this.parser.parseInline>[0]);
          }
          return t.text ?? '';
        }
        return token as string;
      },
    },
  });

  configured = true;
}

/**
 * Render markdown to ANSI-styled terminal output using marked-terminal.
 * Strips sm:begin/sm:end managed block markers for clean display.
 */
export function renderMarkdownToTerminal(md: string): string {
  ensureConfigured();
  const cleaned = md
    .replace(/^<!-- sm:begin \S+ -->\n?/gm, '')
    .replace(/^<!-- sm:end \S+ -->\n?/gm, '');
  return marked.parse(cleaned) as string;
}

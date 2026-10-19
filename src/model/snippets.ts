export interface Snippet {
  name: string;
  description?: string;
  command: string;
  defaults: Record<string, string>;
}

const PLACEHOLDER = /\{\{\{([^{}]+)\}\}\}|\{\{([A-Za-z_][A-Za-z0-9_-]{0,63})\}\}/g;

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

export function parseSnippets(value: unknown): Snippet[] {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  if (!Array.isArray(raw.snippets)) return [];
  return raw.snippets.flatMap((entry): Snippet[] => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const name = text(item.name)?.trim();
    const command = text(item.command);
    if (!name || !command) return [];
    const defaults: Record<string, string> = {};
    for (const arg of Array.isArray(item.arguments) ? item.arguments : []) {
      const argName = text(arg?.name);
      const value = text(arg?.defaultValue);
      if (argName && value !== undefined) defaults[argName] = value;
    }
    const description = text(item.description)?.trim();
    return [{ name, ...(description ? { description } : {}), command, defaults }];
  });
}

export function fillSnippet(snippet: Snippet): string {
  return snippet.command.replace(PLACEHOLDER, (_, literal: string | undefined, arg: string | undefined) =>
    literal !== undefined ? `{{${literal}}}` : (snippet.defaults[arg!] ?? `<${arg}>`),
  );
}

export function snippetsFor(text: string, snippets: Snippet[]): Snippet[] {
  if (!/^\/\S*$/.test(text)) return [];
  const typed = text.slice(1).toLowerCase();
  return snippets.filter((snippet) => snippet.name.toLowerCase().replace(/\s+/g, '-').startsWith(typed));
}

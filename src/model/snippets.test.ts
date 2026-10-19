import { describe, expect, it } from 'vitest';
import { fillSnippet, parseSnippets, snippetsFor } from './snippets';

const WIRE = {
  snippets: [
    { name: 'standup', description: "Draft my standup from yesterday's work", command: 'Draft my standup for {{day}} in {{team}}', arguments: [{ name: 'day', defaultValue: 'yesterday' }, { name: 'team' }], source: 'user' },
    { name: 'Run tests', command: 'pnpm test {{{not-an-arg}}}', arguments: [], source: 'workspace' },
    { name: '', command: 'x', arguments: [] },
    { name: 'no command', arguments: [] },
  ],
};

describe('snippets', () => {
  it('reads snippet.list as the desktop sends it', () => {
    expect(parseSnippets(WIRE)).toEqual([
      { name: 'standup', description: "Draft my standup from yesterday's work", command: 'Draft my standup for {{day}} in {{team}}', defaults: { day: 'yesterday' } },
      { name: 'Run tests', command: 'pnpm test {{{not-an-arg}}}', defaults: {} },
    ]);
    expect(parseSnippets({})).toEqual([]);
  });

  it('fills the composer with defaults put in and an empty argument left to the human', () => {
    const [standup, tests] = parseSnippets(WIRE);
    expect(fillSnippet(standup)).toBe('Draft my standup for yesterday in <team>');
    expect(fillSnippet(tests)).toBe('pnpm test {{not-an-arg}}');
  });

  it('offers the snippets whose name starts with what follows the slash', () => {
    const snippets = parseSnippets(WIRE);
    expect(snippetsFor('/', snippets).map((s) => s.name)).toEqual(['standup', 'Run tests']);
    expect(snippetsFor('/run-', snippets).map((s) => s.name)).toEqual(['Run tests']);
    expect(snippetsFor('/st', snippets).map((s) => s.name)).toEqual(['standup']);
    expect(snippetsFor('standup', snippets)).toEqual([]);
  });
});

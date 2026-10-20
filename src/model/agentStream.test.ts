import { describe, expect, it } from 'vitest';
import { clipTail, MAX_TURNS, applyEvent, applyFrame, EMPTY_STREAM, parseDiff, parseFrame, planDone, StreamState, toolFailed, turnRunning, visibleBlocks, workingFor } from './agentStream';

const run = (events: Record<string, unknown>[], state: StreamState = EMPTY_STREAM, now?: number) => events.reduce((s, e) => applyEvent(s, e, now), state);

describe('agent stream', () => {
  it('PHC-C10 builds a turn from the events: prompt, text, tool with its result, edit and plan', () => {
    const state = run([
      { type: 'turn.started', turn: 1 },
      { type: 'prompt', turn: 1, id: 'p', text: 'fix it' },
      { type: 'text', turn: 1, id: 'a', text: 'Looking' },
      { type: 'tool', turn: 1, id: 't', kind: 'command', name: 'Bash', target: 'pnpm test' },
      { type: 'tool.result', turn: 1, id: 't', output: 'FAIL', exitCode: 1 },
      { type: 'edit', turn: 1, id: 'e', path: 'a.ts', change: 'update', diff: '@@ -1 +1 @@\n-a\n+b\n' },
      { type: 'plan', turn: 1, id: 'pl', items: [{ text: 'one', status: 'done' }, { text: 'two', status: 'active' }] },
      { type: 'turn.ended', turn: 1, status: 'done' },
    ]);
    const [turn] = state.turns;
    expect(turn.prompt).toEqual({ id: 'p', text: 'fix it' });
    expect(turn.blocks.map((b) => b.kind)).toEqual(['text', 'tool', 'edit', 'plan']);
    expect(turn.blocks[1]).toEqual({ kind: 'tool', id: 't', tool: 'command', name: 'Bash', target: 'pnpm test', output: 'FAIL', exitCode: 1 });
    expect(toolFailed(turn.blocks[1] as any)).toBe(true);
    expect(turn.status).toBe('done');
    expect(planDone((turn.blocks[3] as any).items)).toBe('Plan · 1 of 2 done');
  });

  it('PHC-C11 a split event is joined by type and id, and a later text with the same id replaces it', () => {
    const state = run([
      { type: 'turn.started', turn: 1 },
      { type: 'text', turn: 1, id: 'a', text: 'The month ' },
      { type: 'text', turn: 1, id: 'a', text: 'export', append: true },
      { type: 'tool', turn: 1, id: 't', kind: 'command', name: 'Bash', input: 'ls' },
      { type: 'tool.result', turn: 1, id: 't', output: 'a\n' },
      { type: 'tool.result', turn: 1, id: 't', output: 'b\n', append: true },
      { type: 'edit', turn: 1, id: 'e', path: 'a.ts', change: 'add', diff: '@@ -0,0 +1 @@\n+x' },
      { type: 'edit', turn: 1, id: 'e', diff: '\n+y\n', append: true },
      { type: 'plan', turn: 1, id: 'pl', items: [{ text: 'one', status: 'done' }] },
      { type: 'plan', turn: 1, id: 'pl', items: [{ text: 'two', status: 'pending' }], append: true },
      { type: 'prompt', turn: 1, id: 'p', text: 'big ' },
      { type: 'prompt', turn: 1, id: 'p', text: 'prompt', append: true },
    ]);
    const blocks = state.turns[0].blocks as any[];
    expect(blocks[0].text).toBe('The month export');
    expect(blocks[1].output).toBe('a\nb\n');
    expect(blocks[2].diff).toBe('@@ -0,0 +1 @@\n+x\n+y\n');
    expect(blocks[3].items.map((i: any) => i.text)).toEqual(['one', 'two']);
    expect(state.turns[0].prompt?.text).toBe('big prompt');
    expect(run([{ type: 'text', turn: 1, id: 'a', text: 'final' }], state).turns[0].blocks[0]).toEqual({ kind: 'text', id: 'a', text: 'final' });
  });

  it('PHC-C11 events are idempotent by id: a known tool or plan updates in place and keeps its result', () => {
    const state = run([
      { type: 'tool', turn: 1, id: 't', kind: 'read', name: 'Read', target: 'a' },
      { type: 'tool.result', turn: 1, id: 't', output: 'x' },
      { type: 'tool', turn: 1, id: 't', kind: 'read', name: 'Read', target: 'a' },
      { type: 'plan', turn: 1, id: 'pl', items: [{ text: 'one', status: 'active' }] },
      { type: 'plan', turn: 1, id: 'pl', items: [{ text: 'one', status: 'done' }] },
    ]);
    expect(state.turns[0].blocks).toHaveLength(2);
    expect((state.turns[0].blocks[0] as any).output).toBe('x');
    expect((state.turns[0].blocks[1] as any).items[0].status).toBe('done');
  });

  it('PHC-C12 a session event drops everything, live marks the end of the backfill, ended ends the stream', () => {
    const filled = run([{ type: 'turn.started', turn: 1 }, { type: 'live' }]);
    expect(filled.live).toBe(true);
    expect(turnRunning(filled)).toBe(true);
    expect(run([{ type: 'session', session: 'new' }], filled)).toEqual(EMPTY_STREAM);
    const ended = run([{ type: 'ended', reason: 'agent-closed' }], filled);
    expect(ended.ended).toBe('agent-closed');
    expect(turnRunning(ended)).toBe(false);
  });

  it('PHC-C13 a turn only has a clock when it began live, not when it came in the backfill', () => {
    const backfill = applyFrame(EMPTY_STREAM, { paneId: 'p', seq: 1, backfill: true, events: [{ type: 'turn.started', turn: 1 }] }, 5000);
    const live = applyFrame(EMPTY_STREAM, { paneId: 'p', seq: 1, backfill: false, events: [{ type: 'turn.started', turn: 1 }] }, 5000);
    expect(backfill.turns[0].startedAt).toBeUndefined();
    expect(live.turns[0].startedAt).toBe(5000);
    expect(workingFor(undefined, 9000)).toBe('Working');
    expect(workingFor(5000, 9000)).toBe('Working · 4 s');
    expect(workingFor(5000, 5000 + 72_000)).toBe('Working · 1 min 12 s');
  });

  it('PHC-C14 an edit tool is hidden when its diff is shown', () => {
    const turn = run([
      { type: 'tool', turn: 1, id: 'w', kind: 'edit', name: 'Write', target: 'src/a.ts' },
      { type: 'edit', turn: 1, id: 'w', path: 'src/a.ts', change: 'update', diff: '' },
      { type: 'tool', turn: 1, id: 'r', kind: 'read', name: 'Read', target: 'src/a.ts' },
    ]).turns[0];
    expect(visibleBlocks(turn).map((b) => b.kind)).toEqual(['edit', 'tool']);
  });

  it('PHC-C15 reads a diff with its line numbers and counts', () => {
    const { lines, added, removed } = parseDiff('--- a\n+++ b\n@@ -41,3 +41,4 @@\n a\n-b\n+c\n+d\n e\n');
    expect([added, removed]).toEqual([2, 1]);
    expect(lines.map((l) => [l.kind, l.line])).toEqual([['hunk', undefined], ['ctx', 41], ['del', 42], ['add', 42], ['add', 43], ['ctx', 44]]);
  });

  it('PHC-C10 takes only well-formed frames', () => {
    expect(parseFrame({ paneId: 'p', seq: 2, backfill: true, events: [{ type: 'live' }, 'x'] })).toEqual({ paneId: 'p', seq: 2, backfill: true, events: [{ type: 'live' }] });
    expect(parseFrame({ paneId: 'p', events: [] })).toBeNull();
    expect(parseFrame(null)).toBeNull();
    expect(run([{ type: 'teleport', turn: 1, id: 'x' }, { type: 'text' }])).toEqual(EMPTY_STREAM);
  });

  it('PHC-C16 a Codex add or delete diff is raw file content: no cut first character, no colouring of markdown lines', () => {
    const add = parseDiff('# Title\n- item\n+ plus\n', 'add');
    expect(add.lines.map((l) => [l.kind, l.text])).toEqual([['add', '# Title'], ['add', '- item'], ['add', '+ plus']]);
    expect([add.added, add.removed]).toEqual([3, 0]);
    const del = parseDiff('gone\n  indented\n', 'delete');
    expect(del.lines.map((l) => [l.kind, l.text])).toEqual([['del', 'gone'], ['del', '  indented']]);
    expect([del.added, del.removed]).toEqual([0, 2]);
  });

  it('PHC-C16 git headers are skipped and an unprefixed row is kept whole', () => {
    const { lines } = parseDiff('diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n keep\n-old\n+new\nplain\n');
    expect(lines.map((l) => [l.kind, l.text])).toEqual([['hunk', '@@ -1,2 +1,2 @@'], ['ctx', 'keep'], ['del', 'old'], ['add', 'new'], ['ctx', 'plain']]);
  });

  it('PHC-C17 a huge diff is cut to a row limit and says how many rows were left out', () => {
    const big = parseDiff(Array.from({ length: 1200 }, (_, i) => `line ${i}`).join('\n'), 'add');
    expect(big.lines).toHaveLength(500);
    expect(big.hidden).toBe(700);
    expect(big.added).toBe(1200);
  });

  it('PHC-C17 the thread keeps only the newest turns, and a long output keeps its tail with a count', () => {
    const events = Array.from({ length: MAX_TURNS + 10 }, (_, i) => ({ type: 'turn.started', turn: i + 1 }));
    const state = applyFrame(EMPTY_STREAM, { paneId: 'p', seq: 1, backfill: false, events }, 0);
    expect(state.turns).toHaveLength(MAX_TURNS);
    expect(state.turns[0].id).toBe('11');
    const tail = clipTail('a\n'.repeat(20) + 'end', 10);
    expect(tail.text.endsWith('end')).toBe(true);
    expect(tail.hidden).toBeGreaterThan(0);
    expect(clipTail('short', 10)).toEqual({ text: 'short', hidden: 0 });
  });

  it('PHC-C14 an edit tool is only hidden by the same path, not by a path that merely ends the same', () => {
    const turn = run([
      { type: 'tool', turn: 1, id: 'w', kind: 'edit', name: 'Edit', target: 'a.ts' },
      { type: 'edit', turn: 1, id: 'other', path: 'src/a.ts', change: 'update', diff: '' },
    ]).turns[0];
    expect(visibleBlocks(turn).map((b) => b.kind)).toEqual(['tool', 'edit']);
  });
});

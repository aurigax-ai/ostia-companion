import { describe, expect, it } from 'vitest';
import { parseTurnList, stepFailed, stepLine, turnRunning, turnSummary } from './turns';

const WIRE = {
  turns: [
    {
      id: 't1',
      startedAt: 1000,
      prompt: 'Split the ledger export into monthly files',
      steps: [
        { id: 's1', kind: 'command', target: 'pnpm test invoice', exitCode: 1, output: true },
        { id: 's2', kind: 'edit', target: 'src/export/month.ts', output: false },
        { id: 's3', kind: 'teleport', output: false },
        { kind: 'read', output: false },
      ],
      final: 'Export now writes one file per month.',
      commands: 14,
      filesEdited: 4,
      ended: true,
    },
    { id: 't2', startedAt: 2000, prompt: 'Run the export tests too', steps: [], commands: 0, filesEdited: 0, ended: false },
    'nonsense',
  ],
  truncated: true,
};

describe('turns', () => {
  it('PHT-C9 reads turn.list as the desktop sends it and drops what it does not know', () => {
    const list = parseTurnList(WIRE);
    expect(list.truncated).toBe(true);
    expect(list.turns.map((turn) => turn.id)).toEqual(['t1', 't2']);
    expect(list.turns[0].steps).toEqual([
      { id: 's1', kind: 'command', target: 'pnpm test invoice', exitCode: 1, output: true },
      { id: 's2', kind: 'edit', target: 'src/export/month.ts', output: false },
      { id: 's3', kind: 'other', output: false },
    ]);
    expect(list.turns[0].final).toBe('Export now writes one file per month.');
    expect(parseTurnList(null)).toEqual({ turns: [], truncated: false });
  });

  it('says what each step did in one quiet line and marks a failed command', () => {
    const [turn] = parseTurnList(WIRE).turns;
    expect(turn.steps.map(stepLine)).toEqual(['Ran pnpm test invoice', 'Edited src/export/month.ts', 'Used a tool']);
    expect(turn.steps.map(stepFailed)).toEqual([true, false, false]);
    expect(turnSummary(turn)).toBe('14 commands, 4 files edited');
    expect(turnSummary({ ...turn, commands: 1, filesEdited: 0 })).toBe('1 command');
    expect(turnSummary({ ...turn, commands: 0, filesEdited: 0 })).toBeNull();
  });

  it('knows a turn is still running until it ended', () => {
    const list = parseTurnList(WIRE);
    expect(turnRunning(list)).toBe(true);
    expect(turnRunning({ ...list, turns: list.turns.slice(0, 1) })).toBe(false);
    expect(turnRunning({ turns: [], truncated: false })).toBe(false);
  });
});

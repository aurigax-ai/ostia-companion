import { describe, expect, it } from 'vitest';
import { ANSI_PALETTE, DEFAULT_BG, DEFAULT_FG, SCROLLBACK, SKIPPED_NOTICE, TerminalCopy } from './terminalCopy';

const bytes = (text: string) => unescape(encodeURIComponent(text));
const prompt = '\x1b]133;A\x07$ \x1b]133;B\x07';
const run = (cmd: string, out: string, code = 0) => `${prompt}${cmd}\r\n\x1b]133;C\x07${out}\x1b]133;D;${code}\x07`;
const text = (lines: { text: string }[][]) => lines.map((line) => line.map((s) => s.text).join(''));

describe('TerminalCopy', () => {
  it('CRD-V1 keeps one run per OSC 133 command with its exit code, and the running one last', async () => {
    const copy = new TerminalCopy(40, 10);
    await copy.write(bytes(run('ls', 'a\r\nb\r\n') + run('false', 'nope\r\n', 1) + `${prompt}sleep 9\r\n\x1b]133;C\x07waiting\r\n`));
    const runs = copy.runs();
    expect(runs.map((r) => [r.command, r.exitCode, r.running])).toEqual([
      ['ls', 0, false],
      ['false', 1, false],
      ['sleep 9', null, true],
    ]);
    expect(text(runs[0].output)).toEqual(['a', 'b']);
    expect(text(runs[2].output)).toEqual(['waiting']);
  });

  it('CRD-V2 joins lines the emulator wrapped, so output reflows to the reader instead of the desktop width', async () => {
    const copy = new TerminalCopy(10, 6);
    await copy.write(bytes(run('echo long', '0123456789abcdefghij_tail\r\nnext\r\n')));
    expect(text(copy.runs()[0].output)).toEqual(['0123456789abcdefghij_tail', 'next']);
  });

  it('CRD-V3 joins a command that wrapped on the desktop grid', async () => {
    const copy = new TerminalCopy(12, 6);
    await copy.write(bytes(run('echo aaaaaaaaaaaaaaaaaaaa', 'x\r\n')));
    expect(copy.runs()[0].command).toBe('echo aaaaaaaaaaaaaaaaaaaa');
  });

  it('CRD-V4 keeps colours', async () => {
    const copy = new TerminalCopy(40, 6);
    await copy.write(bytes(run('t', '\x1b[31mred\x1b[0m \x1b[91mbright\x1b[0m plain \x1b[38;2;1;2;3mrgb\r\n')));
    const [line] = copy.runs()[0].output;
    expect(line.map((s) => [s.text, s.fg])).toEqual([
      ['red', '#ee5396'],
      [' ', undefined],
      ['bright', '#ee5396'],
      [' plain ', undefined],
      ['rgb', '#010203'],
    ]);
  });

  it('CRD-V4b uses the desktop Oxocarbon palette for the 16 ANSI colours', async () => {
    expect(ANSI_PALETTE).toEqual([
      '#262626', '#ee5396', '#42be65', '#ffe97b', '#33b1ff', '#ff7eb6', '#3ddbd9', '#dde1e6',
      '#393939', '#ee5396', '#42be65', '#ffe97b', '#33b1ff', '#ff7eb6', '#3ddbd9', '#ffffff',
    ]);
    expect([DEFAULT_BG, DEFAULT_FG]).toEqual(['#161616', '#f2f4f8']);
    const copy = new TerminalCopy(60, 6);
    await copy.write(bytes(run('t', '\x1b[30ma\x1b[32mb\x1b[33mc\x1b[34md\x1b[35me\x1b[36mf\x1b[37mg\x1b[90mh\x1b[97mi\r\n')));
    const [line] = copy.runs()[0].output;
    expect(line.map((s) => s.fg)).toEqual(['#262626', '#42be65', '#ffe97b', '#33b1ff', '#ff7eb6', '#3ddbd9', '#dde1e6', '#393939', '#ffffff']);
  });

  it('CRD-V5 marks a running full-screen program, and drops it when the program leaves the alternate screen', async () => {
    const copy = new TerminalCopy(20, 6);
    await copy.write(bytes(`${prompt}vim\r\n\x1b]133;C\x07\x1b[?1049hINSERT`));
    expect(copy.runs()[0]).toMatchObject({ command: 'vim', running: true, fullscreen: true });
    await copy.write(bytes('\x1b[?1049l\x1b]133;D;0\x07'));
    expect(copy.runs()[0]).toMatchObject({ running: false, fullscreen: false });
  });

  it('CRD-V5b the cards before a full-screen program keep their own output while it draws on the alternate screen', async () => {
    const copy = new TerminalCopy(20, 6);
    await copy.write(bytes(run('ls', 'a\r\nb\r\n') + `${prompt}vim\r\n\x1b]133;C\x07\x1b[?1049h\x1b[2J\x1b[Hdrawn by vim`));
    expect(text(copy.runs()[0].output)).toEqual(['a', 'b']);
    expect(copy.runs()[1].output).toEqual([]);
    expect(text(copy.screen()).join('')).toContain('drawn by vim');
  });

  it('CRD-V6 resizes the copy to the attach size before the replay is applied, so absolute cursor moves land', async () => {
    const copy = new TerminalCopy(80, 24);
    copy.resize(30, 5);
    await copy.write(bytes('\x1b[5;1Hbottom'));
    const screen = text(copy.screen());
    expect(screen).toHaveLength(5);
    expect(screen[4].trimEnd()).toBe('bottom');
  });

  it('CRD-V7 without any command marks the whole buffer is one reflowed block', async () => {
    const copy = new TerminalCopy(8, 4);
    await copy.write(bytes('hello world\r\nbye\r\n'));
    expect(copy.runs()).toMatchObject([{ command: '', running: false }]);
    expect(text(copy.runs()[0].output)).toEqual(['hello world', 'bye']);
  });

  it('CRD-V20 reads only the lines a tick changed: finished runs are cached and the repeated runs() is free', async () => {
    const copy = new TerminalCopy(100, 40);
    await copy.write(bytes(run('make', Array.from({ length: 4900 }, (_, i) => `line ${i}`).join('\r\n') + '\r\n')));
    await copy.write(bytes(`${prompt}sleep 9\r\n\x1b]133;C\x07a\r\n`));
    const first = copy.runs();
    expect(first[0].output).toHaveLength(4900);
    expect(copy.runs()).toBe(first);
    const before = copy.linesRead;
    await copy.write(bytes('b\r\n'));
    const second = copy.runs();
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(copy.linesRead - before).toBeLessThan(10);
    await copy.write(bytes('c\r\n'));
    copy.runs();
    expect(copy.linesRead - before).toBeLessThan(20);
    expect(text(copy.runs()[1].output)).toEqual(['a', 'b', 'c']);
  });

  it('CRD-V21 a running command that prints thousands of lines is read incrementally, not from its start each tick', async () => {
    const copy = new TerminalCopy(100, 40);
    await copy.write(bytes(`${prompt}dev\r\n\x1b]133;C\x07`));
    for (let i = 0; i < 20; i++) {
      await copy.write(bytes(Array.from({ length: 200 }, (_, j) => `row ${i * 200 + j}`).join('\r\n') + '\r\n'));
      const before = copy.linesRead;
      copy.runs();
      expect(copy.linesRead - before).toBeLessThan(260);
    }
    const out = copy.runs()[0].output;
    expect(out).toHaveLength(4000);
    expect(text(out)[3999]).toBe('row 3999');
  });

  it('CRD-V22 a flood past the queue limit never throws, is shown as a gap, and later output still lands in order', async () => {
    const copy = new TerminalCopy(100, 40);
    const overwrite = bytes(('a'.repeat(60) + '\r').repeat(15000));
    const failures: unknown[] = [];
    const watch = (error: unknown) => failures.push(error);
    process.on('unhandledRejection', watch);
    const pending: Promise<void>[] = [];
    for (let i = 0; i < 40; i++) pending.push(copy.write(overwrite));
    pending.push(copy.write(bytes('\r\nFINAL-MARKER\r\n')));
    await Promise.all(pending);
    process.off('unhandledRejection', watch);
    expect(failures).toEqual([]);
    expect(copy.skippedBytes).toBeGreaterThan(0);
    expect(text(copy.window(0, copy.lineCount)).join('|')).toContain(SKIPPED_NOTICE);
    expect(text(copy.screen()).join('|')).toContain('FINAL-MARKER');
    await copy.write(bytes('\x1b[31mafter\x1b[0m\r\n'));
    expect(text(copy.screen()).join('|')).toContain('after');
  }, 60000);

  it('CRD-V23 a gap aborts a half escape sequence, so the next output is not eaten', async () => {
    const copy = new TerminalCopy(40, 6);
    const pending: Promise<void>[] = [copy.write(bytes('x'.repeat(100) + '\x1b[3'))];
    for (let i = 0; i < 10; i++) pending.push(copy.write(bytes('y'.repeat(1024 * 1024))));
    await Promise.all(pending);
    await copy.write(bytes('\r\nvisible\r\n'));
    expect(copy.skippedBytes).toBeGreaterThan(0);
    expect(text(copy.screen()).join('|')).toContain('visible');
  }, 60000);

  it('CRD-V24 a run whose start scrolled out keeps its exit code and tail with a trimmed flag, and earlier runs stay', async () => {
    const copy = new TerminalCopy(40, 6);
    await copy.write(bytes(run('first', 'one\r\n', 0)));
    await copy.write(bytes(`${prompt}big\r\n\x1b]133;C\x07` + Array.from({ length: SCROLLBACK + 800 }, (_, i) => `n${i}`).join('\r\n') + '\r\n\x1b]133;D;3\x07'));
    const runs = copy.runs();
    expect(runs.map((r) => [r.command, r.exitCode])).toEqual([
      ['first', 0],
      ['big', 3],
    ]);
    expect(runs[1].trimmed).toBe(true);
    expect(text(runs[1].output).at(-1)).toBe(`n${SCROLLBACK + 799}`);
    expect(runs[1].output.length).toBeGreaterThan(1000);
  });

  it('CRD-V25 a prompt that starts without a D closes the run instead of leaving it running and duplicating later output', async () => {
    const copy = new TerminalCopy(40, 6);
    await copy.write(bytes(`${prompt}ssh host\r\n\x1b]133;C\x07inside\r\n`));
    await copy.write(bytes(`${prompt}ls\r\n\x1b]133;C\x07file\r\n\x1b]133;D;0\x07`));
    const runs = copy.runs();
    expect(runs.map((r) => [r.command, r.running, r.exitCode])).toEqual([
      ['ssh host', false, null],
      ['ls', false, 0],
    ]);
    expect(text(runs[0].output)).toEqual(['inside']);
    expect(text(runs[1].output)).toEqual(['file']);
  });

  it('CRD-V26 only the current run can be full screen', async () => {
    const copy = new TerminalCopy(40, 6);
    await copy.write(bytes(`${prompt}vim\r\n\x1b]133;C\x07\x1b[?1049hx\x1b[?1049l`));
    await copy.write(bytes(`${prompt}ls\r\n\x1b]133;C\x07a\r\n\x1b]133;D;0\x07`));
    await copy.write(bytes('\x1b[?1049h'));
    expect(copy.runs().filter((r) => r.fullscreen).map((r) => r.command)).toEqual([]);
  });

  it('CRD-V27 a program that prints OSC 133 marks cannot forge a run, and the last D wins', async () => {
    const copy = new TerminalCopy(60, 8);
    await copy.write(bytes(`${prompt}cat evil.txt\r\n\x1b]133;C\x07x\r\n\x1b]133;C\x07\x1b]133;D;0\x07y\r\n\x1b]133;D;7\x07`));
    await copy.write(bytes(prompt));
    const runs = copy.runs();
    expect(runs.map((r) => r.command)).toEqual(['cat evil.txt']);
    expect(runs[0].exitCode).toBe(7);
    expect(text(runs[0].output)).toEqual(['x', 'y']);
  });

  it('CRD-V28 marks printed while a full-screen program runs are ignored', async () => {
    const copy = new TerminalCopy(40, 6);
    await copy.write(bytes(`${prompt}vim\r\n\x1b]133;C\x07\x1b[?1049h\x1b]133;D;9\x07`));
    expect(copy.runs()[0]).toMatchObject({ command: 'vim', running: true, exitCode: null });
  });

  it('CRD-V29 the command text drops a right prompt and a continuation line, and the shell-sent text wins', async () => {
    const copy = new TerminalCopy(40, 8);
    await copy.write(bytes(`\x1b]133;A\x07$ \x1b]133;B\x07git status${' '.repeat(18)}14:03:22\r\n\x1b]133;C\x07\x1b]133;D;0\x07`));
    await copy.write(bytes(`\x1b]133;A\x07$ \x1b]133;B\x07echo a  b\r\n> more\r\n\x1b]133;C\x07\x1b]133;D;0\x07`));
    await copy.write(bytes(`\x1b]133;A\x07$ \x1b]133;B\x07ignored\r\n\x1b]633;E;ls \\x3b pwd\x07\x1b]133;C\x07\x1b]133;D;0\x07`));
    expect(copy.runs().map((r) => r.command)).toEqual(['git status', 'echo a  b', 'ls ; pwd']);
  });

  it('CRD-V30 a resize queued behind output applies after that output, so the output wraps at the old width', async () => {
    const copy = new TerminalCopy(20, 4);
    const first = copy.write(bytes('0123456789abcdefghij0123\r\n'));
    const resized = copy.resize(40, 4);
    const second = copy.write(bytes('after resize\r\n'));
    await Promise.all([first, resized, second]);
    expect(copy.cols).toBe(40);
    expect(text(copy.window(0, 4)).join('|')).toContain('0123456789abcdefghij0123');
  });

  it('CRD-V31 wide characters join without their padding cell and are placed by cumulative width', async () => {
    const copy = new TerminalCopy(20, 4);
    await copy.write(bytes(run('echo', '你好 ab\r\n', 0)));
    expect(text(copy.runs()[0].output)).toEqual(['你好 ab']);
    await copy.write(bytes('\x1b[2J\x1b[H你好ab'));
    const [line] = copy.window(copy.baseY, 1);
    expect(line.map((s) => [s.text.trimEnd(), s.col])).toEqual([['你', 0], ['好', 2], ['ab', 4]]);
  });

  it('CRD-V32 keeps strikethrough and hides invisible text', async () => {
    const copy = new TerminalCopy(30, 4);
    await copy.write(bytes(run('x', '\x1b[9mgone\x1b[0m \x1b[8msecret\x1b[0m\r\n', 0)));
    const [line] = copy.runs()[0].output;
    expect(line[0]).toMatchObject({ text: 'gone', strike: true });
    expect(line[2].fg).toBe('#161616');
  });

  it('CRD-V33 reports bracketed paste mode from the program', async () => {
    const copy = new TerminalCopy(30, 4);
    expect(copy.bracketedPaste).toBe(false);
    await copy.write(bytes('\x1b[?2004h'));
    expect(copy.bracketedPaste).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { TerminalCopy } from './terminalCopy';

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
    await copy.write(bytes(run('t', '\x1b[31mred\x1b[0m plain \x1b[38;2;1;2;3mrgb\r\n')));
    const [line] = copy.runs()[0].output;
    expect(line.map((s) => [s.text, s.fg])).toEqual([
      ['red', '#00dfdb'],
      [' plain ', undefined],
      ['rgb', '#010203'],
    ]);
  });

  it('CRD-V5 marks a running full-screen program, and drops it when the program leaves the alternate screen', async () => {
    const copy = new TerminalCopy(20, 6);
    await copy.write(bytes(`${prompt}vim\r\n\x1b]133;C\x07\x1b[?1049hINSERT`));
    expect(copy.runs()[0]).toMatchObject({ command: 'vim', running: true, fullscreen: true });
    await copy.write(bytes('\x1b[?1049l\x1b]133;D;0\x07'));
    expect(copy.runs()[0]).toMatchObject({ running: false, fullscreen: false });
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
});

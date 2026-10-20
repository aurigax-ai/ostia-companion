import { IBufferCell, IBufferLine, IMarker, Terminal } from '@xterm/headless';

export interface Span {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export type Line = Span[];

export interface CommandRun {
  id: number;
  command: string;
  exitCode: number | null;
  running: boolean;
  fullscreen: boolean;
  output: Line[];
}

export const DEFAULT_FG = '#f2f4f8';
export const DEFAULT_BG = '#161616';

export const ANSI_PALETTE = [
  '#161616', '#00dfdb', '#00b4ff', '#ff4297', '#00c15a', '#c693ff', '#ff74b8', '#f2f4f8',
  '#585858', '#00dfdb', '#00b4ff', '#ff4297', '#00c15a', '#c693ff', '#ff74b8', '#f2f4f8',
];

const SCROLLBACK = 5000;
const OSC_SHELL_INTEGRATION = 133;
const CUBE = [0, 95, 135, 175, 215, 255];

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function paletteColor(index: number): string {
  if (index < 16) return ANSI_PALETTE[index];
  if (index < 232) {
    const n = index - 16;
    return hex(CUBE[Math.floor(n / 36)], CUBE[Math.floor(n / 6) % 6], CUBE[n % 6]);
  }
  const level = 8 + (index - 232) * 10;
  return hex(level, level, level);
}

function colorOf(isDefault: boolean, isPalette: boolean, value: number): string | undefined {
  if (isDefault) return undefined;
  if (isPalette) return paletteColor(value);
  return hex((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function sameStyle(a: Span, b: Span): boolean {
  return a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.dim === b.dim && a.italic === b.italic && a.underline === b.underline;
}

function styleOf(cell: IBufferCell): Omit<Span, 'text'> {
  let fg = colorOf(cell.isFgDefault(), cell.isFgPalette(), cell.getFgColor());
  let bg = colorOf(cell.isBgDefault(), cell.isBgPalette(), cell.getBgColor());
  if (cell.isInverse()) [fg, bg] = [bg ?? DEFAULT_BG, fg ?? DEFAULT_FG];
  const style: Omit<Span, 'text'> = {};
  if (fg) style.fg = fg;
  if (bg) style.bg = bg;
  if (cell.isBold()) style.bold = true;
  if (cell.isDim()) style.dim = true;
  if (cell.isItalic()) style.italic = true;
  if (cell.isUnderline()) style.underline = true;
  return style;
}

function readLine(line: IBufferLine, from: number, to: number, cell: IBufferCell, into: Line) {
  for (let x = from; x < to; x++) {
    const c = line.getCell(x, cell);
    if (!c || c.getWidth() === 0) continue;
    const text = c.getChars() || ' ';
    const style = styleOf(c);
    const last = into[into.length - 1];
    if (last && sameStyle(last, style as Span)) last.text += text;
    else into.push({ text, ...style });
  }
}

function trimEnd(line: Line): Line {
  const out = line.map((span) => ({ ...span }));
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last.bg) break;
    last.text = last.text.trimEnd();
    if (last.text !== '') break;
    out.pop();
  }
  return out;
}

function plain(line: Line): string {
  return line.map((span) => span.text).join('');
}

interface Mark {
  line: IMarker;
  x: number;
}

interface Pending {
  id: number;
  commandStart: Mark | null;
  outputStart: Mark | null;
  end: IMarker | null;
  endX: number;
  exitCode: number | null;
  command: string;
}

export class TerminalCopy {
  private term: Terminal;
  private cell: IBufferCell;
  private pending: Pending[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();
  private marksSeen = false;

  constructor(public cols: number, public rows: number) {
    this.term = new Terminal({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true, convertEol: false });
    this.cell = this.term.buffer.active.getNullCell();
    this.term.parser.registerOscHandler(OSC_SHELL_INTEGRATION, (data) => {
      this.mark(data);
      return true;
    });
    this.term.buffer.onBufferChange(() => this.emit());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  write(binary: string): Promise<void> {
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Promise((resolve) =>
      this.term.write(bytes, () => {
        this.emit();
        resolve();
      }),
    );
  }

  resize(cols: number, rows: number) {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.term.resize(cols, rows);
    this.emit();
  }

  reset() {
    this.term.reset();
    this.pending = [];
    this.marksSeen = false;
    this.emit();
  }

  dispose() {
    this.listeners.clear();
    this.term.dispose();
  }

  get alternate(): boolean {
    return this.term.buffer.active.type === 'alternate';
  }

  private here(): Mark | null {
    const marker = this.term.registerMarker(0);
    return marker ? { line: marker, x: this.term.buffer.active.cursorX } : null;
  }

  private mark(data: string) {
    const [kind, arg] = data.split(';');
    this.marksSeen = true;
    const current = this.pending[this.pending.length - 1];
    if (kind === 'B') {
      if (current && !current.outputStart) current.commandStart = this.here();
      else this.pending.push({ id: this.nextId++, commandStart: this.here(), outputStart: null, end: null, endX: 0, exitCode: null, command: '' });
    } else if (kind === 'C') {
      let run = this.pending[this.pending.length - 1];
      if (!run || run.outputStart) {
        run = { id: this.nextId++, commandStart: null, outputStart: null, end: null, endX: 0, exitCode: null, command: '' };
        this.pending.push(run);
      }
      run.outputStart = this.here();
      run.command = this.readCommand(run.commandStart, run.outputStart);
    } else if (kind === 'D') {
      if (current?.outputStart && !current.end) {
        current.end = this.term.registerMarker(0) ?? null;
        current.endX = this.term.buffer.active.cursorX;
        const code = arg === undefined || arg === '' ? 0 : Number(arg);
        current.exitCode = Number.isFinite(code) ? code : 0;
      }
    }
    this.pending = this.pending.filter((run) => !run.outputStart || run.outputStart.line.line >= 0);
  }

  private logical(startLine: number, startX: number, endLine: number, endX: number, keepBlank = false): Line[] {
    const buffer = this.term.buffer.active;
    const lines: Line[] = [];
    for (let y = startLine; y <= endLine && y < buffer.length; y++) {
      const line = buffer.getLine(y);
      if (!line) continue;
      const from = y === startLine ? startX : 0;
      const to = y === endLine ? Math.min(endX, this.cols) : this.cols;
      const piece: Line = [];
      readLine(line, from, to, this.cell, piece);
      if (line.isWrapped && lines.length > 0) {
        const prev = lines[lines.length - 1];
        piece.forEach((span) => {
          const last = prev[prev.length - 1];
          if (last && sameStyle(last, span)) last.text += span.text;
          else prev.push({ ...span });
        });
      } else lines.push(piece);
    }
    const trimmed = lines.map(trimEnd);
    lines.length = 0;
    lines.push(...trimmed);
    if (!keepBlank) while (lines.length > 0 && plain(lines[lines.length - 1]) === '') lines.pop();
    return lines;
  }

  private readCommand(start: Mark | null, end: Mark | null): string {
    if (!start || !end || start.line.line < 0 || end.line.line < 0) return '';
    let endLine = end.line.line;
    let endX = end.x;
    if (endX === 0) {
      endLine -= 1;
      endX = this.cols;
    }
    if (endLine < start.line.line) return '';
    return this.logical(start.line.line, start.x, endLine, endX, true)
      .map(plain)
      .join(' ')
      .trim();
  }

  private lastContentLine(): number {
    const buffer = this.term.buffer.active;
    for (let y = buffer.length - 1; y >= 0; y--) {
      if (buffer.getLine(y)?.translateToString(true).trim()) return y;
    }
    return 0;
  }

  runs(): CommandRun[] {
    const buffer = this.term.buffer.active;
    if (!this.marksSeen) {
      const output = this.logical(0, 0, Math.max(buffer.length - 1, 0), this.cols);
      return output.length === 0 ? [] : [{ id: 0, command: '', exitCode: null, running: false, fullscreen: false, output }];
    }
    return this.pending.flatMap((run) => {
      if (!run.outputStart || run.outputStart.line.line < 0) return [];
      const start = run.outputStart.line.line;
      const running = !run.end;
      let output: Line[] = [];
      if (running && this.alternate) {
        output = [];
      } else if (running) {
        output = this.logical(start, run.outputStart.x, this.lastContentLine(), this.cols);
      } else {
        const endLine = run.end!.line;
        const last = run.endX === 0 ? endLine - 1 : endLine;
        output = last >= start ? this.logical(start, run.outputStart.x, last, run.endX === 0 ? this.cols : run.endX) : [];
      }
      return [{ id: run.id, command: run.command, exitCode: run.exitCode, running, fullscreen: running && this.alternate, output }];
    });
  }

  screen(): Line[] {
    const buffer = this.term.buffer.active;
    const lines: Line[] = [];
    for (let y = 0; y < this.rows; y++) {
      const line = buffer.getLine(buffer.baseY + y);
      const piece: Line = [];
      if (line) readLine(line, 0, this.cols, this.cell, piece);
      lines.push(piece);
    }
    return lines;
  }

  cursor(): { x: number; y: number } {
    const buffer = this.term.buffer.active;
    return { x: buffer.cursorX, y: buffer.cursorY };
  }
}

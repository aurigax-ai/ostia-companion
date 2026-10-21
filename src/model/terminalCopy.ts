import './xtermShim';
import { IBufferCell, IBufferLine, IMarker, Terminal } from '@xterm/headless';

export interface Span {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  col?: number;
  wide?: boolean;
}

export type Line = Span[];

export interface CommandRun {
  id: number;
  command: string;
  exitCode: number | null;
  running: boolean;
  fullscreen: boolean;
  trimmed: boolean;
  output: Line[];
}

export const DEFAULT_FG = '#f2f4f8';
export const DEFAULT_BG = '#161616';

export const ANSI_PALETTE = [
  '#161616', '#ee5396', '#00b4ff', '#ff4297', '#00c15a', '#c693ff', '#ff74b8', '#f2f4f8',
  '#585858', '#ee5396', '#00b4ff', '#ff4297', '#00c15a', '#c693ff', '#ff74b8', '#f2f4f8',
];

export const SCROLLBACK = 5000;
export const SKIPPED_NOTICE = '[output skipped]';
const CHUNK_BYTES = 64 * 1024;
const MAX_QUEUE_BYTES = 8 * 1024 * 1024;
const MAX_RUNS = 300;
const OSC_SHELL_INTEGRATION = 133;
const OSC_VSCODE = 633;
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
  return (
    a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.dim === b.dim && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike
  );
}

function styleOf(cell: IBufferCell): Omit<Span, 'text'> {
  let fg = colorOf(cell.isFgDefault(), cell.isFgPalette(), cell.getFgColor());
  let bg = colorOf(cell.isBgDefault(), cell.isBgPalette(), cell.getBgColor());
  if (cell.isInverse()) [fg, bg] = [bg ?? DEFAULT_BG, fg ?? DEFAULT_FG];
  if (cell.isInvisible()) fg = bg ?? DEFAULT_BG;
  const style: Omit<Span, 'text'> = {};
  if (fg) style.fg = fg;
  if (bg) style.bg = bg;
  if (cell.isBold()) style.bold = true;
  if (cell.isDim()) style.dim = true;
  if (cell.isItalic()) style.italic = true;
  if (cell.isUnderline()) style.underline = true;
  if (cell.isStrikethrough()) style.strike = true;
  return style;
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

export function plain(line: Line): string {
  return line.map((span) => span.text).join('');
}

function unescapeCommand(text: string): string {
  return text.replace(/\\x([0-9a-fA-F]{2})/g, (_, code: string) => String.fromCharCode(parseInt(code, 16))).replace(/\\\\/g, '\\');
}

interface Rec {
  id: number;
  command: string;
  exitCode: number | null;
  state: 'running' | 'done';
  startM: IMarker | null;
  startX: number;
  resumeM: IMarker | null;
  resumeX: number;
  endM: IMarker | null;
  endX: number;
  committed: Line[];
  trimmed: boolean;
  frozen: boolean;
  viewRevision: number;
  view: CommandRun;
}

export class TerminalCopy {
  private term: Terminal;
  private cell: IBufferCell;
  private records: Rec[] = [];
  private implicit: Rec;
  private nextId = 1;
  private listeners = new Set<() => void>();
  private marksSeen = false;
  private promptPending = false;
  private pendingCommand: string | null = null;
  private promptMark: { marker: IMarker; x: number } | null = null;
  private queue: Op[] = [];
  private queuedBytes = 0;
  private pumping = false;
  private disposed = false;
  private revision = 0;
  private snapshot: CommandRun[] = [];
  private snapshotRevision = -1;
  private snapshotFullscreen = false;
  skippedBytes = 0;
  linesRead = 0;

  constructor(public cols: number, public rows: number) {
    this.term = new Terminal({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true, convertEol: false });
    this.cell = this.term.buffer.active.getNullCell();
    this.term.parser.registerOscHandler(OSC_SHELL_INTEGRATION, (data) => {
      if (!this.alternate) this.mark(data);
      return true;
    });
    this.term.parser.registerOscHandler(OSC_VSCODE, (data) => {
      if (!this.alternate && data.startsWith('E;')) this.pendingCommand = unescapeCommand(data.slice(2).split(';')[0]);
      return true;
    });
    this.implicit = this.newRec(0);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  write(binary: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Promise((resolve) => {
      this.queue.push({ kind: 'data', bytes, done: resolve });
      this.queuedBytes += bytes.length;
      if (this.queuedBytes > MAX_QUEUE_BYTES) this.skipQueued();
      void this.pump();
    });
  }

  resize(cols: number, rows: number): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return new Promise((resolve) => {
      this.queue.push({ kind: 'resize', cols, rows, done: resolve });
      void this.pump();
    });
  }

  reset(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return new Promise((resolve) => {
      this.queue.push({ kind: 'reset', done: resolve });
      void this.pump();
    });
  }

  private skipQueued() {
    const kept: Op[] = [];
    let skipped = 0;
    for (const op of this.queue) {
      if (op.kind === 'data') {
        skipped += op.bytes.length;
        op.done();
      } else kept.push(op);
    }
    this.queue = kept;
    this.queuedBytes = 0;
    this.skippedBytes += skipped;
    const notice = new TextEncoder().encode(`\x18\x1b[0m\r\n${SKIPPED_NOTICE}\r\n`);
    this.queue.push({ kind: 'data', bytes: notice, done: () => {} });
    this.queuedBytes += notice.length;
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0 && !this.disposed) {
        const op = this.queue.shift()!;
        if (op.kind === 'data') {
          this.queuedBytes -= op.bytes.length;
          for (let at = 0; at < op.bytes.length && !this.disposed; at += CHUNK_BYTES) {
            const slice = op.bytes.subarray(at, at + CHUNK_BYTES);
            await new Promise<void>((resolve) => {
              try {
                this.term.write(slice, resolve);
              } catch {
                resolve();
              }
            });
          }
        } else if (op.kind === 'resize') {
          this.term.resize(op.cols, op.rows);
          this.cols = op.cols;
          this.rows = op.rows;
        } else {
          this.term.reset();
          this.records.forEach((rec) => this.freeze(rec));
          this.records = [];
          this.implicit = this.newRec(0);
          this.marksSeen = false;
          this.promptPending = false;
          this.pendingCommand = null;
          this.promptMark = null;
        }
        this.revision++;
        op.done();
        this.emit();
        await Promise.resolve();
      }
    } finally {
      this.pumping = false;
    }
  }

  dispose() {
    this.disposed = true;
    this.queue.forEach((op) => op.done());
    this.queue = [];
    this.listeners.clear();
    this.term.dispose();
  }

  get alternate(): boolean {
    return this.term.buffer.active.type === 'alternate';
  }

  get bracketedPaste(): boolean {
    return this.term.modes.bracketedPasteMode;
  }

  private markerAt(line: number): IMarker | null {
    const buffer = this.term.buffer.active;
    return this.term.registerMarker(line - (buffer.baseY + buffer.cursorY)) ?? null;
  }

  private here(): { marker: IMarker; x: number } | null {
    const marker = this.term.registerMarker(0);
    return marker ? { marker, x: this.term.buffer.active.cursorX } : null;
  }

  private newRec(id: number): Rec {
    const marker = this.term.registerMarker(0) ?? null;
    return {
      id,
      command: '',
      exitCode: null,
      state: 'running',
      startM: marker,
      startX: 0,
      resumeM: null,
      resumeX: 0,
      endM: null,
      endX: 0,
      committed: [],
      trimmed: false,
      frozen: false,
      viewRevision: -1,
      view: { id, command: '', exitCode: null, running: true, fullscreen: false, trimmed: false, output: [] },
    };
  }

  private freeze(rec: Rec) {
    rec.startM?.dispose();
    rec.resumeM?.dispose();
    rec.endM?.dispose();
    rec.startM = rec.resumeM = rec.endM = null;
    rec.frozen = true;
  }

  private current(): Rec | undefined {
    return this.records[this.records.length - 1];
  }

  private freezeFinished() {
    const rec = this.current();
    if (rec && rec.state === 'done' && !rec.frozen) this.freeze(rec);
  }

  private closeRunning() {
    const rec = this.current();
    if (!rec || rec.state !== 'running') return;
    const { last, lastX } = this.cursorEnd();
    this.advance(rec, last, lastX, true);
    rec.state = 'done';
    rec.exitCode = null;
    this.freeze(rec);
    this.refresh(rec);
  }

  private cursorEnd(): { last: number; lastX: number } {
    const buffer = this.term.buffer.active;
    const y = buffer.baseY + buffer.cursorY;
    return buffer.cursorX === 0 ? { last: y - 1, lastX: this.cols } : { last: y, lastX: buffer.cursorX };
  }

  private mark(data: string) {
    const [kind, arg] = data.split(';');
    this.marksSeen = true;
    if (kind === 'A') {
      this.closeRunning();
      this.freezeFinished();
      this.promptPending = true;
    } else if (kind === 'B') {
      this.closeRunning();
      this.freezeFinished();
      this.promptPending = true;
      this.promptMark?.marker.dispose();
      this.promptMark = this.here();
    } else if (kind === 'C') {
      if (!this.promptPending) return;
      this.promptPending = false;
      this.freezeFinished();
      const start = this.here();
      if (!start) return;
      const rec = this.newRec(this.nextId++);
      rec.startM?.dispose();
      rec.startM = start.marker;
      rec.startX = start.x;
      rec.command = this.pendingCommand ?? this.readCommand(this.promptMark);
      this.pendingCommand = null;
      this.promptMark?.marker.dispose();
      this.promptMark = null;
      this.records.push(rec);
      this.refresh(rec);
      while (this.records.length > MAX_RUNS) this.freeze(this.records.shift()!);
    } else if (kind === 'D') {
      const rec = this.current();
      if (!rec || rec.frozen) return;
      const code = arg === undefined || arg === '' ? 0 : Number(arg);
      const exitCode = Number.isFinite(code) ? code : 0;
      const { last, lastX } = this.cursorEnd();
      if (rec.state === 'running') {
        this.advance(rec, last, lastX, true);
      } else if (rec.startM && !rec.startM.isDisposed) {
        rec.committed = [];
        rec.resumeM?.dispose();
        rec.resumeM = null;
        this.advance(rec, last, lastX, true);
      }
      rec.state = 'done';
      rec.exitCode = exitCode;
      rec.endM?.dispose();
      rec.endM = this.term.registerMarker(0) ?? null;
      this.refresh(rec);
    }
  }

  private readCommand(prompt: { marker: IMarker; x: number } | null): string {
    if (!prompt || prompt.marker.isDisposed) return '';
    const buffer = this.term.buffer.normal;
    let y = prompt.marker.line;
    const first = buffer.getLine(y);
    if (!first) return '';
    let text = first.translateToString(false, prompt.x);
    let wrapped = false;
    for (let next = buffer.getLine(y + 1); next?.isWrapped; next = buffer.getLine(y + 1)) {
      text += next.translateToString(false);
      y++;
      wrapped = true;
    }
    text = text.replace(/\s+$/, '');
    if (!wrapped) {
      const match = /\s{2,}(?!.*\s{2,})(\S.*)$/.exec(text);
      if (match && prompt.x + text.length >= this.cols - 2 && prompt.x + text.length - match[1].length >= this.cols / 2) text = text.slice(0, match.index);
    }
    return text.trim();
  }

  private readLine(line: IBufferLine, from: number, to: number, into: Line, placeCells: boolean) {
    this.linesRead++;
    let col = from;
    for (let x = from; x < to; x++) {
      const c = line.getCell(x, this.cell);
      if (!c || c.getWidth() === 0) continue;
      const width = c.getWidth();
      const text = c.getChars() || ' ';
      const style = styleOf(c);
      const last = into[into.length - 1];
      if (last && !last.wide && width === 1 && sameStyle(last, style as Span)) last.text += text;
      else {
        const span: Span = { text, ...style };
        if (placeCells) span.col = col;
        if (width === 2) span.wide = true;
        into.push(span);
      }
      col += width;
    }
  }

  private readLogical(startLine: number, startX: number, endLine: number, endX: number): { lines: Line[]; starts: number[] } {
    const buffer = this.term.buffer.active;
    const lines: Line[] = [];
    const starts: number[] = [];
    for (let y = Math.max(0, startLine); y <= endLine && y < buffer.length; y++) {
      const line = buffer.getLine(y);
      if (!line) continue;
      const from = y === startLine ? startX : 0;
      const to = y === endLine ? Math.min(endX, this.cols) : this.cols;
      const piece: Line = [];
      this.readLine(line, from, to, piece, false);
      if (line.isWrapped && lines.length > 0) {
        const previous = lines[lines.length - 1];
        piece.forEach((span) => {
          const last = previous[previous.length - 1];
          if (last && !last.wide && !span.wide && sameStyle(last, span)) last.text += span.text;
          else previous.push({ ...span });
        });
      } else {
        lines.push(piece);
        starts.push(y);
      }
    }
    return { lines: lines.map(trimEnd), starts };
  }

  private advance(rec: Rec, endLine: number, endX: number, final: boolean): Line[] {
    let from: number;
    let fromX: number;
    if (rec.resumeM && !rec.resumeM.isDisposed) {
      from = rec.resumeM.line;
      fromX = rec.resumeX;
    } else if (rec.committed.length === 0 && rec.startM && !rec.startM.isDisposed) {
      from = rec.startM.line;
      fromX = rec.startX;
    } else {
      from = 0;
      fromX = 0;
      rec.trimmed = true;
    }
    rec.resumeM?.dispose();
    rec.resumeM = null;
    if (from > endLine) return [];
    const { lines, starts } = this.readLogical(from, fromX, endLine, endX);
    let tail: Line[] = [];
    if (final) rec.committed.push(...lines);
    else if (lines.length > 0) {
      rec.committed.push(...lines.slice(0, -1));
      tail = [lines[lines.length - 1]];
      const start = starts[starts.length - 1];
      rec.resumeM = this.markerAt(start);
      rec.resumeX = start === from ? fromX : 0;
    }
    if (rec.committed.length > SCROLLBACK) {
      rec.committed.splice(0, rec.committed.length - SCROLLBACK);
      rec.trimmed = true;
    }
    return tail;
  }

  private refresh(rec: Rec, tail: Line[] = []) {
    const output = tail.length > 0 ? [...rec.committed, ...tail] : rec.committed.slice();
    while (output.length > 0 && plain(output[output.length - 1]) === '') output.pop();
    rec.view = {
      id: rec.id,
      command: rec.command,
      exitCode: rec.exitCode,
      running: rec.state === 'running' && rec.id !== 0,
      fullscreen: false,
      trimmed: rec.trimmed || !!(rec.startM && rec.startM.isDisposed),
      output,
    };
    rec.viewRevision = this.revision;
  }

  private lastContentLine(): number {
    const buffer = this.term.buffer.normal;
    for (let y = buffer.length - 1; y >= 0; y--) {
      if (buffer.getLine(y)?.translateToString(true).trim()) return y;
    }
    return 0;
  }

  fullscreenCommand(): string | null {
    const rec = this.current();
    return rec && rec.state === 'running' && this.alternate ? rec.command : null;
  }

  runs(): CommandRun[] {
    const fullscreen = this.fullscreenCommand() !== null;
    if (this.snapshotRevision === this.revision && this.snapshotFullscreen === fullscreen) return this.snapshot;
    const recs = this.marksSeen ? this.records : [this.implicit];
    const rec = recs[recs.length - 1];
    if (rec && rec.state === 'running' && !rec.frozen && !this.alternate && rec.viewRevision !== this.revision) {
      const tail = this.advance(rec, this.lastContentLine(), this.cols, false);
      this.refresh(rec, tail);
    }
    const views = recs.map((r) => r.view);
    if (!this.marksSeen && views[0].output.length === 0) views.length = 0;
    if (fullscreen && views.length > 0) views[views.length - 1] = { ...views[views.length - 1], fullscreen: true };
    this.snapshot = views;
    this.snapshotRevision = this.revision;
    this.snapshotFullscreen = fullscreen;
    return views;
  }

  get lineCount(): number {
    return this.term.buffer.active.length;
  }

  get baseY(): number {
    return this.term.buffer.active.baseY;
  }

  window(top: number, count: number): Line[] {
    const buffer = this.term.buffer.active;
    const lines: Line[] = [];
    for (let y = top; y < top + count; y++) {
      const line = buffer.getLine(y);
      const piece: Line = [];
      if (line) this.readLine(line, 0, this.cols, piece, true);
      lines.push(piece);
    }
    return lines;
  }

  screen(): Line[] {
    return this.window(this.baseY, this.rows);
  }

  cursor(): { x: number; y: number } {
    const buffer = this.term.buffer.active;
    return { x: buffer.cursorX, y: buffer.baseY + buffer.cursorY };
  }
}

type Op =
  | { kind: 'data'; bytes: Uint8Array; done: () => void }
  | { kind: 'resize'; cols: number; rows: number; done: () => void }
  | { kind: 'reset'; done: () => void };

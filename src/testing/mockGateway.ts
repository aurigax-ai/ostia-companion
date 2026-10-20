import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Pane, SessionState } from '../model/workspaces.ts';
import { checkCode } from '../services/pairCheck.ts';
import { agentPromptScreen, demoScenario, PROMPT_OPTIONS, type Scenario, SHELL_PROMPT, shellScreen, VIM_SCREEN } from './mockScenario.ts';

export type MockCap = 'read' | 'notify' | 'respond' | 'command' | 'input' | 'destructive';
export type MockDecision = 'approve' | 'deny' | 'never';

export interface MockAddress {
  kind: 'tailnet' | 'phone' | 'lan';
  host: string;
  port: number;
}

export interface MockGatewayOptions {
  addresses?: MockAddress[];
  port?: number;
  name?: string;
  caps?: MockCap[];
  decision?: MockDecision;
  approveAfterMs?: number;
  expireMs?: number;
  reusableCode?: boolean;
  helloTimeoutMs?: number;
  scenario?: Scenario;
  devicesFile?: string;
  screenController?: boolean;
  onScreen?: (screen: MockScreenLink) => void;
  log?: (line: string) => void;
  phoneWorkspace?: { sessionId: string; agent: 'claude' | 'codex' };
  hooksOff?: string[];
  imagesUnsupported?: boolean;
}

export interface MockScreenFrame {
  header: { seq: number; width: number; height: number; screenWidth: number; screenHeight: number; blocked: boolean };
  jpeg: Buffer;
}

export interface MockScreenLink {
  screenId: string;
  deviceId: string;
  start: Record<string, any>;
  events: { type: string; payload: any }[];
  frames: MockScreenFrame[];
  closed: boolean;
  request: (method: string, params?: object) => Promise<any>;
  close: (code?: number, reason?: string) => void;
}

export interface MockDevice {
  deviceId: string;
  deviceToken: string;
  name: string;
  caps: MockCap[];
}

export interface MockGateway {
  port: number;
  fingerprint: string;
  certificate: string;
  name: string;
  pairCode: string;
  checkCodes: string[];
  devices: MockDevice[];
  payload: (host: string) => object;
  link: (host: string) => string;
  mintCode: () => string;
  revoke: (deviceId: string) => void;
  setCaps: (deviceId: string, caps: MockCap[]) => void;
  updatePane: (paneId: string, patch: Partial<Pane>) => void;
  setSessionState: (sessionId: string, state: SessionState) => void;
  resizePane: (paneId: string, cols: number, rows: number) => void;
  typed: (paneId: string) => string[];
  pasted: (paneId: string) => { mime: string; bytes: number }[];
  opened: string[];
  screens: MockScreenLink[];
  requestScreen: (sessionId: string, from?: { agent: string; reason: string }) => string;
  declined: { requestId: string; reason: string }[];
  writeArtifact: (sessionId: string, path: string, content: string | null) => void;
  setAddresses: (next: MockAddress[]) => void;
  move: (port?: number) => Promise<number>;
  close: () => Promise<void>;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CAP_ORDER: MockCap[] = ['read', 'notify', 'respond', 'command', 'input', 'destructive'];
const CLOSE_UNAUTHENTICATED = 4001;
const CLOSE_REVOKED = 4003;
const CLOSE_CAPS_CHANGED = 4004;
const UNAUTHENTICATED = -32001;
const NEEDS_ELEVATION = -32003;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const READ_LIMIT = 256 * 1024;

function certificate(name: string) {
  const dir = join(tmpdir(), 'ostia-mock-gateway', name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  if (!existsSync(cert)) {
    mkdirSync(join(dir, '..'), { recursive: true });
    const fresh = mkdtempSync(`${dir}-`);
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
        '-keyout', join(fresh, 'key.pem'), '-out', join(fresh, 'cert.pem'), '-days', '3650', '-subj', '/CN=ostia-mock-gateway'],
      { stdio: 'ignore' },
    );
    try {
      renameSync(fresh, dir);
    } catch {
      rmSync(fresh, { recursive: true, force: true });
    }
  }
  const pem = readFileSync(cert);
  const der = new X509Certificate(pem).raw;
  return { key: readFileSync(key), cert: pem, fingerprint: `sha256/${createHash('sha256').update(der).digest('base64')}` };
}

function newCode(): string {
  return Array.from(randomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function canonical(caps: MockCap[]): MockCap[] {
  return CAP_ORDER.filter((cap) => caps.includes(cap));
}

function readJson(req: import('node:http').IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
  });
}

function send(res: import('node:http').ServerResponse, status: number, body: object) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

interface PendingPair {
  pairCode: string;
  device: { name: string; pubkey: string };
  commit: string;
  desktopNonce: Buffer;
  startedAt: number;
}

interface Connection {
  socket: WebSocket;
  device: MockDevice | null;
  attached: string | null;
  role: 'observer' | 'owner';
  screen: MockScreenLink | null;
  streams: Map<string, number>;
}

const SCREEN_LIMITS = [300, 900, 1800];
const NO_CONTROLLER = -32004;
const STREAM_FRAME_BYTES = 1024 * 1024;
const STREAMS_PER_SOCKET = 4;
const RATE_LIMITED = -32007;
const AGENT_STARTS_PER_MINUTE = 3;
const PROMPT_LIMIT = 4000;
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const IMAGE_LIMIT_BYTES = 10 * 1024 * 1024;
const IMAGES_PER_MINUTE = 6;
const FRAME_BYTES = 1024 * 1024;
const IMAGE_FRAME_BYTES = 16 * 1024 * 1024;
const CLOSE_TOO_BIG = 1009;
const REFUSED_KINDS = ['scratch', 'manager'];
const SCREEN_GRACE_MS = 5000;
const CLOSE_TIME_LIMIT = 4005;
const LINK_ONLY = -32600;

function screenStartProblem(params: any): string | null {
  const whole = (value: unknown, min: number) => Number.isInteger(value) && (value as number) >= min;
  if (typeof params.sessionId !== 'string' || !params.sessionId) return 'bad-params';
  if (!whole(params.width, 1) || !whole(params.height, 1) || !whole(params.rotation, 0)) return 'bad-params';
  if (typeof params.density !== 'number' || params.density <= 0) return 'bad-params';
  if (params.level !== 'view' && params.level !== 'control') return 'bad-params';
  if (!SCREEN_LIMITS.includes(params.limitSec) || !whole(params.endsAt, 1) || !whole(params.overlayHeight, 0)) return 'bad-params';
  if (typeof params.label !== 'string') return 'bad-params';
  if (params.agent !== undefined && params.agent !== 'claude' && params.agent !== 'codex') return 'bad-params';
  return null;
}

function parseScreenFrame(data: Buffer): MockScreenFrame | null {
  if (data.length < 5) return null;
  const length = data.readUInt32BE(1);
  if (5 + length > data.length) return null;
  try {
    return { header: JSON.parse(data.subarray(5, 5 + length).toString('utf8')), jpeg: data.subarray(5 + length) };
  } catch {
    return null;
  }
}

export async function startMockGateway(options: MockGatewayOptions = {}): Promise<MockGateway> {
  const {
    name = 'Mock desktop',
    caps = ['read', 'notify'],
    decision = 'approve',
    approveAfterMs = 0,
    expireMs = 120_000,
    reusableCode = false,
    helloTimeoutMs = 10_000,
    scenario = demoScenario(),
    devicesFile,
    screenController = true,
    onScreen = () => {},
    log = () => {},
    phoneWorkspace,
    hooksOff = [],
  } = options;
  const screens: MockScreenLink[] = [];
  const { key, cert, fingerprint } = certificate(name);
  const codes = new Map<string, number>();
  const pending = new Map<string, PendingPair>();
  const devices: MockDevice[] = (devicesFile && existsSync(devicesFile) ? JSON.parse(readFileSync(devicesFile, 'utf8')) : []).map(
    (device: MockDevice) => ({ ...device, caps: canonical(caps) }),
  );
  const saveDevices = () => devicesFile && writeFileSync(devicesFile, JSON.stringify(devices));
  const checkCodes: string[] = [];
  const connections = new Set<Connection>();
  const output = new Map<string, string>();
  const sizes = new Map<string, { cols: number; rows: number }>();
  const lineBuffers = new Map<string, string>();
  const vimPanes = new Set<string>();
  const sizeOf = (paneId: string) => sizes.get(paneId) ?? { cols: 64, rows: 30 };
  const holds = new Map<string, { holder: Connection; desktop: { cols: number; rows: number } }>();
  const setSize = (paneId: string, cols: number, rows: number) => {
    const before = sizeOf(paneId);
    if (before.cols === cols && before.rows === rows) return;
    sizes.set(paneId, { cols, rows });
    const frame = JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'pty.size', payload: { paneId, cols, rows } } });
    connections.forEach((c) => c.attached === paneId && c.socket.send(frame));
  };
  const release = (connection: Connection, paneId: string) => {
    const hold = holds.get(paneId);
    if (hold?.holder !== connection) return;
    holds.delete(paneId);
    setSize(paneId, hold.desktop.cols, hold.desktop.rows);
  };
  const typed = new Map<string, string[]>();
  const opened: string[] = [];
  const agentStarts = new Map<string, number[]>();
  const imagePastes = new Map<string, number[]>();
  const pasted = new Map<string, { mime: string; bytes: number }[]>();
  const pendingRequests = new Set<string>();
  const declined: { requestId: string; reason: string }[] = [];
  let screenRequests = 0;
  let startedPanes = 0;
  const touched = new Map<string, number>();
  const started = Date.now();
  let selected = 0;
  let addresses = options.addresses ?? null;

  const mintCode = () => {
    const code = newCode();
    codes.set(code, Date.now());
    return code;
  };
  let pairCode = mintCode();

  const screenOf = (pane: Pane) =>
    pane.paneId === 'p-claude' ? agentPromptScreen(selected, pane.agentState === 'waiting' ? null : 0) : shellScreen(pane);
  scenario.panes.filter((pane) => pane.kind === 'terminal').forEach((pane) => output.set(pane.paneId, screenOf(pane)));

  const event = (type: string, payload: object, cap: MockCap | null = 'read') => {
    const frame = JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type, payload } });
    connections.forEach((c) => c.device && (cap === null || c.device.caps.includes(cap)) && c.socket.send(frame));
  };

  const streamTo = (target: Connection, paneId: string, events: Record<string, unknown>[], backfill: boolean) => {
    const frames: Record<string, unknown>[][] = [[]];
    let size = 0;
    for (const item of events) {
      const bytes = Buffer.byteLength(JSON.stringify(item));
      if (size + bytes > STREAM_FRAME_BYTES && frames[frames.length - 1].length > 0) {
        frames.push([]);
        size = 0;
      }
      frames[frames.length - 1].push(item);
      size += bytes;
    }
    for (const chunk of frames) {
      const seq = (target.streams.get(paneId) ?? 0) + 1;
      target.streams.set(paneId, seq);
      target.socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'agent.stream', payload: { paneId, seq, backfill, events: chunk } } }));
    }
  };

  const streamPane = (paneId: string, events: Record<string, unknown>[]) => {
    const kept = (scenario.streams[paneId] ??= []);
    kept.push(...events.filter((e) => e.type !== 'ask' && e.type !== 'ask.resolved'));
    connections.forEach((c) => c.streams.has(paneId) && streamTo(c, paneId, events, false));
  };

  const replyInStream = (paneId: string, prompt: string) => {
    const turn = Math.max(0, ...(scenario.streams[paneId] ?? []).map((e) => Number(e.turn) || 0)) + 1;
    streamPane(paneId, [
      { type: 'turn.started', turn },
      { type: 'prompt', turn, id: `pr-${turn}`, text: prompt },
      { type: 'text', turn, id: `tx-${turn}`, text: 'Noted.' },
      { type: 'turn.ended', turn, status: 'done' },
    ]);
  };

  const writePane = (paneId: string, text: string) => {
    output.set(paneId, (output.get(paneId) ?? '') + text);
    const frame = Buffer.concat([Buffer.from([0x01]), Buffer.from(text, 'utf8')]);
    connections.forEach((c) => c.attached === paneId && c.socket.send(frame));
  };

  const updatePane = (paneId: string, patch: Partial<Pane>) => {
    const pane = scenario.panes.find((p) => p.paneId === paneId);
    if (!pane) return;
    Object.assign(pane, patch);
    const { cwd, running, blockCount, lastExitCode } = pane;
    event('pane.state', { paneId, generation: Date.now(), cwd, running, blockCount, lastExitCode });
  };

  const setSessionState = (sessionId: string, state: SessionState) => {
    const session = scenario.sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;
    session.state = state;
    event('session.state', { sessionId, state });
  };

  const server: Server = createServer({ key, cert }, async (req, res) => {
    const body = req.method === 'POST' ? await readJson(req) : null;
    if (req.url === '/pair' && req.method === 'POST') {
      if (!body?.pairCode || !body.device?.name || !body.device?.pubkey || !body.commit) {
        return send(res, 400, { error: 'bad-request' });
      }
      const code = String(body.pairCode).replace(/[\s-]/g, '').toUpperCase();
      const minted = codes.get(code);
      const expired = !reusableCode && minted !== undefined && Date.now() - minted > expireMs;
      if (minted === undefined || expired) return send(res, 401, { error: 'invalid-pair-code' });
      if (!reusableCode) {
        codes.delete(code);
        pairCode = mintCode();
      }
      const requestId = randomBytes(12).toString('hex');
      const desktopNonce = randomBytes(32);
      pending.set(requestId, { pairCode: code, device: body.device, commit: body.commit, desktopNonce, startedAt: Date.now() });
      log(`pair: ${body.device.name} sent the code`);
      return send(res, 200, { requestId, nonce: desktopNonce.toString('base64') });
    }
    if (req.url === '/pair/confirm' && req.method === 'POST') {
      const request = pending.get(body?.requestId);
      if (!request) return send(res, 404, { error: 'unknown-request' });
      pending.delete(body.requestId);
      const phoneNonce = Buffer.from(String(body.nonce ?? ''), 'base64');
      if (createHash('sha256').update(phoneNonce).digest('hex') !== request.commit) {
        return send(res, 400, { error: 'commit-mismatch' });
      }
      const code = checkCode(fingerprint, request.device.pubkey, phoneNonce, request.desktopNonce);
      checkCodes.push(code);
      log(`pair: check code ${code.slice(0, 3)} ${code.slice(3)} (${decision})`);
      const expiry = setTimeout(() => send(res, 408, { error: 'expired' }), Math.max(0, request.startedAt + expireMs - Date.now()));
      const decide = setTimeout(() => {
        clearTimeout(expiry);
        if (decision === 'deny') return send(res, 403, { error: 'declined' });
        const device: MockDevice = {
          deviceId: `dev_${randomBytes(6).toString('hex')}`,
          deviceToken: randomBytes(24).toString('base64url'),
          name: request.device.name,
          caps: canonical(caps),
        };
        devices.push(device);
        saveDevices();
        log(`pair: approved ${device.deviceId}`);
        send(res, 200, { deviceId: device.deviceId, deviceToken: device.deviceToken, caps: device.caps, expiresAt: null });
      }, approveAfterMs);
      if (decision === 'never') clearTimeout(decide);
      res.on('close', () => {
        if (res.writableEnded) return;
        clearTimeout(decide);
        clearTimeout(expiry);
        log('pair: the phone withdrew its request');
      });
      return;
    }
    send(res, 404, { error: 'not-found' });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket) => {
    const connection: Connection = { socket, device: null, attached: null, role: 'observer', screen: null, streams: new Map() };
    connections.add(connection);
    const helloTimer = setTimeout(() => socket.close(CLOSE_UNAUTHENTICATED, 'hello timeout'), helloTimeoutMs);
    const respond = (id: unknown, result: object) => socket.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
    const fail = (id: unknown, code: number, message: string, data?: object) =>
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } }));
    const has = (cap: MockCap) => connection.device?.caps.includes(cap) ?? false;

    const handleShell = (paneId: string, text: string) => {
      if (vimPanes.has(paneId)) {
        if (!text.includes('\r')) return;
        vimPanes.delete(paneId);
        return writePane(paneId, `\x1b[?1049l\x1b]133;D;0\x07${SHELL_PROMPT}`);
      }
      let line = lineBuffers.get(paneId) ?? '';
      for (const char of text) {
        if (char === '\x7f') {
          if (line) writePane(paneId, '\b \b');
          line = line.slice(0, -1);
        } else if (char === '\r') {
          lineBuffers.set(paneId, '');
          return runShellLine(paneId, line);
        } else if (char >= ' ') {
          line += char;
          writePane(paneId, char);
        }
      }
      lineBuffers.set(paneId, line);
    };

    const runShellLine = (paneId: string, line: string) => {
      const command = line.trim();
      if (command === 'vim' || command.startsWith('vim ')) {
        vimPanes.add(paneId);
        return writePane(paneId, `\r\n\x1b]133;C\x07${VIM_SCREEN}`);
      }
      const output = command === '' ? '' : command.startsWith('echo ') ? `${command.slice(5)}\r\n` : `zsh: command not found: ${command.split(' ')[0]}\r\n`;
      const exitCode = command === '' || command.startsWith('echo ') ? 0 : 127;
      writePane(paneId, `\r\n\x1b]133;C\x07${output}\x1b]133;D;${exitCode}\x07${SHELL_PROMPT}`);
    };

    const handleInput = (text: string) => {
      const paneId = connection.attached;
      if (!paneId) return;
      const pane = scenario.panes.find((p) => p.paneId === paneId)!;
      if (paneId === 'p-claude' && pane.agentState === 'waiting') {
        if (text === '\x1b[A') selected = (selected + PROMPT_OPTIONS.length - 1) % PROMPT_OPTIONS.length;
        else if (text === '\x1b[B') selected = (selected + 1) % PROMPT_OPTIONS.length;
        else if (/^[1-3]$/.test(text)) selected = Number(text) - 1;
        if (text !== '\r') return writePane(paneId, agentPromptScreen(selected, null));
        writePane(paneId, agentPromptScreen(selected, selected));
        updatePane(paneId, { agentState: 'working', agentMessage: undefined });
        return setSessionState(pane.sessionId, 'working');
      }
      if (!pane.agent) return handleShell(paneId, text);
      const echoed = text.replace(/\r/g, '\r\n').replace(/\x7f/g, '\b \b').replace(/\x03/g, '^C\r\n');
      writePane(paneId, echoed);
    };

    const pendingScreen = new Map<string, (message: any) => void>();
    let screenRequestId = 0;

    const openScreen = (id: unknown, params: any) => {
      const device = connection.device!;
      if (!screenController) return fail(id, NO_CONTROLLER, 'no-controller');
      const problem = screenStartProblem(params);
      if (problem) return fail(id, INVALID_PARAMS, problem);
      if (!scenario.sessions.some((s) => s.sessionId === params.sessionId)) return fail(id, INVALID_PARAMS, 'unknown-session');
      if (screens.some((s) => !s.closed && s.deviceId === device.deviceId)) return fail(id, INVALID_PARAMS, 'busy');
      if (typeof params.requestId === 'string') pendingRequests.delete(params.requestId);
      const screen: MockScreenLink = {
        screenId: `scr_${randomBytes(6).toString('hex')}`,
        deviceId: device.deviceId,
        start: params,
        events: [],
        frames: [],
        closed: false,
        request: (method, requestParams = {}) =>
          new Promise((resolve, reject) => {
            if (screen.closed) return reject(new Error('link closed'));
            const requestId = `d${++screenRequestId}`;
            pendingScreen.set(requestId, resolve);
            socket.send(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params: requestParams }));
          }),
        close: (code = 1000, reason = 'closed') => socket.close(code, reason),
      };
      const limit = setTimeout(() => screen.close(CLOSE_TIME_LIMIT, 'time-limit'), Math.max(0, params.endsAt + SCREEN_GRACE_MS - Date.now()));
      socket.on('close', () => clearTimeout(limit));
      connection.screen = screen;
      screens.push(screen);
      log(`screen: ${screen.screenId} from ${device.name} for ${params.sessionId} (${params.level}, ${params.limitSec / 60} min${params.requestId ? `, answers ${params.requestId}` : ""}${params.agent ? `, ${params.agent}` : ""})`);
      respond(id, { screenId: screen.screenId });
      onScreen(screen);
    };

    socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (!connection.screen && data.length > (connection.device && !options.imagesUnsupported ? IMAGE_FRAME_BYTES : FRAME_BYTES)) return socket.close(CLOSE_TOO_BIG, 'frame too large');
      if (isBinary && connection.screen) {
        if (data[0] !== 0x10) return;
        const frame = parseScreenFrame(data);
        if (frame) connection.screen.frames.push(frame);
        return;
      }
      if (!isBinary && connection.screen) {
        let reply: any;
        try {
          reply = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (reply.method === 'event') {
          connection.screen.events.push(reply.params);
          if (reply.params?.type === 'screen.state') log(`screen: ${reply.params.payload?.state} ${reply.params.payload?.reason ?? ''}`.trim());
          return;
        }
        const resolve = pendingScreen.get(reply.id);
        if (resolve) {
          pendingScreen.delete(reply.id);
          return resolve(reply);
        }
      }
      if (isBinary) {
        const type = data[0];
        if (type === 0x03) return fail(null, INVALID_PARAMS, 'resize-not-supported');
        if (type !== 0x02) return;
        if (connection.role !== 'owner' || !has('input')) return fail(null, NEEDS_ELEVATION, 'needs-elevation', { cap: 'input' });
        if (type === 0x02) handleInput(data.subarray(1).toString('utf8'));
        return;
      }
      let message: any;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      const { id, method, params = {} } = message;
      if (method === 'hello') {
        const device = devices.find((d) => d.deviceToken === params.deviceToken);
        if (!device) {
          fail(id, UNAUTHENTICATED, 'unauthenticated');
          return socket.close(CLOSE_UNAUTHENTICATED, 'unauthenticated');
        }
        clearTimeout(helloTimer);
        connection.device = device;
        return respond(id, { deviceId: device.deviceId, caps: device.caps, ...(options.imagesUnsupported ? {} : { features: ['prompt-image'] }), desktop: { name, version: 'mock' }, ...(addresses ? { addresses } : {}), ...(phoneWorkspace ? { phoneWorkspace: { set: true, agent: phoneWorkspace.agent } } : {}) });
      }
      if (!connection.device) {
        fail(id, UNAUTHENTICATED, 'unauthenticated');
        return socket.close(CLOSE_UNAUTHENTICATED, 'unauthenticated');
      }
      if (method === 'screen.start') return has('read') ? openScreen(id, params) : fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'read' });
      if (connection.screen && !['ask.answer', 'ask.list'].includes(method)) return fail(id, LINK_ONLY, 'link-only');
      if (method === 'artifact.open' && !has('command')) return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'command' });
      if (['ask.answer', 'agent.prompt', 'agent.interrupt', 'agent.start'].includes(method) && !has('respond')) {
        return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'respond' });
      }
      if (['session.list', 'pane.list', 'pty.attach', 'pty.detach', 'ask.list', 'fs.list', 'fs.read'].includes(method) && !has('read')) {
        return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'read' });
      }
      if (method === 'session.list') return respond(id, { sessions: scenario.sessions.map((s) => (s.sessionId === phoneWorkspace?.sessionId ? { ...s, phone: true } : s)) });
      if (['turn.list', 'turn.output', 'snippet.list'].includes(method) && !has('read')) return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'read' });
      if (method === 'agent.stream.open') {
        if (!has('read')) return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'read' });
        if (typeof params.paneId !== 'string') return fail(id, INVALID_PARAMS, 'missing paneId');
        const turns = params.turns === undefined ? 5 : params.turns;
        if (!Number.isInteger(turns) || turns < 1 || turns > 50) return fail(id, INVALID_PARAMS, 'bad-params');
        const pane = scenario.panes.find((p) => p.paneId === params.paneId);
        if (!pane || (pane.agent !== 'claude' && pane.agent !== 'codex') || hooksOff.includes(pane.paneId)) return fail(id, INVALID_PARAMS, 'not-an-agent');
        if (!connection.streams.has(pane.paneId) && connection.streams.size >= STREAMS_PER_SOCKET) return fail(id, INVALID_PARAMS, 'too-many-streams');
        const events = scenario.streams[pane.paneId] ?? [];
        const kept = new Set([...new Set(events.map((e) => e.turn).filter((turn) => turn !== undefined))].slice(-turns));
        const backfill = events.filter((e) => e.turn === undefined || kept.has(e.turn));
        const asks = scenario.asks.filter((a) => a.paneId === pane.paneId).map((a) => ({ type: 'ask', askId: a.askId, kind: a.kind }));
        connection.streams.set(pane.paneId, 0);
        respond(id, { ok: true, paneId: pane.paneId, agent: pane.agent, session: `sess-${pane.paneId}`, truncated: kept.size < new Set(events.map((e) => e.turn)).size });
        streamTo(connection, pane.paneId, [...backfill, ...asks, { type: 'live' }], true);
        return;
      }
      if (method === 'agent.stream.close') {
        if (!has('read')) return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'read' });
        if (typeof params.paneId !== 'string') return fail(id, INVALID_PARAMS, 'missing paneId');
        connection.streams.delete(params.paneId);
        return respond(id, { ok: true });
      }
      if (method === 'snippet.list') {
        if (params.sessionId !== undefined && !scenario.sessions.some((s) => s.sessionId === params.sessionId && !REFUSED_KINDS.includes(s.kind))) {
          return fail(id, INVALID_PARAMS, 'unknown-session');
        }
        const own = scenario.snippets.filter((s) => s.source === 'user' || s.sessionId === params.sessionId);
        return respond(id, { snippets: own.map(({ sessionId: _, ...snippet }) => snippet) });
      }
      if (method === 'ask.list') return respond(id, { asks: scenario.asks });
      if (method === 'fs.list' || method === 'fs.read' || method === 'artifact.open') {
        if (typeof params.sessionId !== 'string' || !params.sessionId) return fail(id, INVALID_PARAMS, 'missing sessionId');
        if (typeof params.path !== 'string') return fail(id, INVALID_PARAMS, 'missing path');
        const session = scenario.sessions.find((s) => s.sessionId === params.sessionId);
        if (!session) return fail(id, INVALID_PARAMS, 'unknown-session');
        const root = method === 'artifact.open' ? 'artifacts' : (params.root ?? 'workspace');
        if (root !== 'workspace' && root !== 'artifacts') return fail(id, INVALID_PARAMS, 'invalid-root');
        const artifacts = root === 'artifacts';
        const tree = artifacts ? scenario.artifacts[session.sessionId] : (scenario.files[session.sessionId] ?? {});
        if (!tree) return fail(id, INVALID_PARAMS, 'not-found');
        const raw = params.path;
        const normal = posix.normalize(raw || '.');
        if (raw.startsWith('/') || normal === '..' || normal.startsWith('../')) return fail(id, INVALID_PARAMS, 'outside-workspace');
        const path = normal === '.' ? '' : normal.replace(/\/$/, '');
        const depth = path ? path.split('/').length : 0;
        if (method !== 'fs.list') {
          const content = tree[path];
          if (content === undefined || (artifacts && depth > 2)) {
            const folder = path === '' || Object.keys(tree).some((file) => file.startsWith(`${path}/`));
            return fail(id, INVALID_PARAMS, folder ? 'not-a-file' : 'not-found');
          }
          if (method === 'artifact.open') {
            opened.push(`${session.sessionId}:${path}`);
            return respond(id, { ok: true });
          }
          const file = Buffer.from(content, content.includes('\u0000') ? 'latin1' : 'utf8');
          const start = Math.min(Number.isInteger(params.offset) && params.offset > 0 ? params.offset : 0, file.length);
          const limit = Number.isInteger(params.maxBytes) && params.maxBytes >= 0 ? Math.min(params.maxBytes, READ_LIMIT) : READ_LIMIT;
          const bytes = file.subarray(start, start + limit);
          const truncated = start + bytes.length < file.length;
          let text: string | null = null;
          for (const cut of start > 0 || bytes.includes(0) ? [] : truncated ? [0, 1, 2, 3] : [0]) {
            try {
              text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytes.length - cut));
              break;
            } catch {}
          }
          return respond(id, { ...(text === null ? { base64: bytes.toString('base64') } : { text }), size: file.length, truncated });
        }
        if (artifacts && depth > 1) return fail(id, INVALID_PARAMS, 'not-found');
        if (tree[path] !== undefined) return fail(id, INVALID_PARAMS, 'not-a-directory');
        const prefix = path ? `${path}/` : '';
        const names = new Map<string, { kind: 'file' | 'dir'; size: number; mtime: number }>();
        Object.entries(tree).forEach(([file, content], index) => {
          if (!file.startsWith(prefix)) return;
          const [head, ...rest] = file.slice(prefix.length).split('/');
          if (rest.length > 0 && artifacts && depth === 1) return;
          const mtime = touched.get(`${session.sessionId}:${file}`) ?? started - index * 60_000;
          names.set(head, rest.length > 0 ? { kind: 'dir', size: 0, mtime: Math.max(mtime, names.get(head)?.mtime ?? 0) } : { kind: 'file', size: Buffer.byteLength(content), mtime });
        });
        if (path && names.size === 0) return fail(id, INVALID_PARAMS, 'not-found');
        return respond(id, { entries: [...names].map(([name, info]) => ({ name, ...info })).sort((a, b) => a.name.localeCompare(b.name)) });
      }
      if (method === 'ask.answer') {
        const ask = scenario.asks.find((a) => a.askId === params.askId);
        const choice = ask?.choices.find((c) => c.id === params.choiceId);
        if (!ask || (!choice && !(ask.allowText && params.text))) return fail(id, INVALID_PARAMS, 'unknown-ask');
        scenario.asks = scenario.asks.filter((a) => a !== ask);
        const outcome = choice?.id ?? 'text';
        if (ask.paneId === 'p-claude') writePane(ask.paneId, agentPromptScreen(0, choice?.tone === 'deny' ? 2 : 0));
        updatePane(ask.paneId, { agentState: choice?.tone === 'deny' ? 'waiting' : 'working', agentMessage: undefined });
        setSessionState(ask.sessionId, choice?.tone === 'deny' ? 'waiting' : 'working');
        event('ask.resolved', { askId: ask.askId, outcome });
        streamPane(ask.paneId, [{ type: 'ask.resolved', askId: ask.askId, outcome }]);
        log(`ask: ${ask.askId} answered ${outcome}`);
        return respond(id, { ok: true });
      }
      if (method === 'agent.prompt' || method === 'agent.interrupt') {
        const pane = scenario.panes.find((p) => p.paneId === params.paneId);
        if (!pane?.agent || pane.agent === 'other') return fail(id, INVALID_PARAMS, 'not-an-agent');
        const sentImage = method === 'agent.prompt' && params.image !== undefined && !options.imagesUnsupported;
        if (sentImage) {
          const { mime, data } = params.image ?? {};
          if (!IMAGE_MIMES.includes(mime) || typeof data !== 'string') return fail(id, INVALID_PARAMS, 'image-type');
          const bytes = Buffer.from(data, 'base64').length;
          if (bytes > IMAGE_LIMIT_BYTES) return fail(id, INVALID_PARAMS, 'image-too-large');
          const now = Date.now();
          const recent = (imagePastes.get(connection.device!.deviceId) ?? []).filter((at) => now - at < 60_000);
          if (recent.length >= IMAGES_PER_MINUTE) return fail(id, RATE_LIMITED, 'rate-limited');
          imagePastes.set(connection.device!.deviceId, [...recent, now]);
          pasted.set(pane.paneId, [...(pasted.get(pane.paneId) ?? []), { mime, bytes }]);
        }
        const keys = method === 'agent.prompt' ? `${params.text}\r` : params.key === 'ctrl-c' ? '\x03' : '\x1b';
        typed.set(pane.paneId, [...(typed.get(pane.paneId) ?? []), keys]);
        if (method === 'agent.prompt') {
          writePane(pane.paneId, `\r\n\x1b[36m>\x1b[0m ${params.text}\r\n`);
          replyInStream(pane.paneId, params.text);
        }
        else writePane(pane.paneId, '\r\n\x1b[90m(interrupted)\x1b[0m\r\n');
        log(`agent: ${method} ${pane.paneId}${sentImage ? ' with an image' : ''}`);
        return respond(id, sentImage ? { ok: true, image: 'pasted' } : { ok: true });
      }
      if (method === 'screen.decline') {
        if (!has('notify')) return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'notify' });
        if (!['off', 'unsupported', 'denied', 'busy'].includes(params.reason)) return fail(id, INVALID_PARAMS, 'bad-params');
        if (!pendingRequests.delete(params.requestId)) return fail(id, INVALID_PARAMS, 'unknown-request');
        declined.push({ requestId: params.requestId, reason: params.reason });
        log(`screen: request ${params.requestId} declined (${params.reason})`);
        return respond(id, {});
      }
      if (method === 'agent.start') {
        if (params.sessionId === undefined && !phoneWorkspace) return fail(id, INVALID_PARAMS, 'phone-workspace-unavailable');
        const session = scenario.sessions.find((s) => s.sessionId === (params.sessionId ?? phoneWorkspace?.sessionId));
        if (!session) return fail(id, INVALID_PARAMS, 'unknown-session');
        params.agent = params.agent ?? phoneWorkspace?.agent ?? 'claude';
        if (REFUSED_KINDS.includes(session.kind)) return fail(id, INVALID_PARAMS, 'refused');
        const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
        if (!['claude', 'codex'].includes(params.agent) || !prompt || prompt.length > PROMPT_LIMIT || /^[-+]/.test(prompt) || !/\s/.test(prompt)) {
          return fail(id, INVALID_PARAMS, 'bad-params');
        }
        const now = Date.now();
        const recent = (agentStarts.get(connection.device!.deviceId) ?? []).filter((at) => now - at < 60_000);
        if (recent.length >= AGENT_STARTS_PER_MINUTE) return fail(id, RATE_LIMITED, 'rate-limited');
        agentStarts.set(connection.device!.deviceId, [...recent, now]);
        const paneId = `p-start-${++startedPanes}`;
        scenario.panes.push({ paneId, sessionId: session.sessionId, kind: 'terminal', title: params.agent, cwd: session.workDir, running: true, blockCount: 1, agent: params.agent, agentState: 'working' });
        writePane(paneId, `$ ${params.agent} '${prompt.replace(/'/g, "'\\''")}'\r\n\x1b[36m>\x1b[0m ${prompt}\r\n`);
        scenario.streams[paneId] = [{ type: 'turn.started', turn: 1 }, { type: 'prompt', turn: 1, id: 'pr-1', text: prompt }];
        setSessionState(session.sessionId, 'working');
        log(`agent: agent.start ${paneId} in ${session.sessionId}`);
        return respond(id, { paneId, confirmed: true });
      }
      if (method === 'pane.list') {
        const panes = params.sessionId ? scenario.panes.filter((p) => p.sessionId === params.sessionId) : scenario.panes;
        return respond(id, { panes });
      }
      if (method === 'pty.attach') {
        const pane = scenario.panes.find((p) => p.paneId === params.paneId);
        if (!pane || pane.kind !== 'terminal') return fail(id, INVALID_PARAMS, 'unknown pane');
        connection.attached = pane.paneId;
        connection.role = params.role === 'owner' && has('input') ? 'owner' : 'observer';
        const history = output.get(pane.paneId) ?? '';
        const since = Math.max(0, Math.min(Number(params.sinceCursor) || 0, history.length));
        const replay = history.slice(since);
        if (replay) socket.send(Buffer.concat([Buffer.from([0x01]), Buffer.from(replay, 'utf8')]));
        return respond(id, { cursor: history.length, dropped: false, ...sizeOf(pane.paneId), role: connection.role });
      }
      if (method === 'pty.hold' || method === 'pty.release') {
        if (!has('input')) return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'input' });
        if (connection.attached !== params.paneId) return fail(id, INVALID_PARAMS, 'not-attached');
        if (method === 'pty.release') {
          release(connection, params.paneId);
          return respond(id, { ok: true });
        }
        const valid = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 1000;
        if (!valid(params.cols) || !valid(params.rows)) return fail(id, INVALID_PARAMS, 'bad-size');
        const current = holds.get(params.paneId);
        if (current && current.holder !== connection) return fail(id, INVALID_PARAMS, 'held-by-other');
        holds.set(params.paneId, { holder: connection, desktop: current?.desktop ?? sizeOf(params.paneId) });
        setSize(params.paneId, params.cols, params.rows);
        return respond(id, { ok: true, cols: params.cols, rows: params.rows });
      }
      if (method === 'pty.detach') {
        if (connection.attached) release(connection, connection.attached);
        connection.attached = null;
        return respond(id, {});
      }
      fail(id, METHOD_NOT_FOUND, 'method not found');
    });

    socket.on('close', () => {
      if (connection.attached) release(connection, connection.attached);
      clearTimeout(helloTimer);
      connections.delete(connection);
      if (connection.screen) {
        connection.screen.closed = true;
        log(`screen: ${connection.screen.screenId} closed`);
      }
      pendingScreen.forEach((resolve) => resolve({ error: { code: -1, message: 'link closed' } }));
      pendingScreen.clear();
    });
  });

  const listen = (wanted: number) =>
    new Promise<number>((resolve) => server.listen(wanted, '0.0.0.0', () => resolve((server.address() as AddressInfo).port)));
  const port = await listen(options.port ?? 0);

  const gateway: MockGateway = {
    port,
    fingerprint,
    certificate: cert.toString(),
    name,
    get pairCode() {
      return pairCode;
    },
    checkCodes,
    devices,
    payload: (host) => ({ v: 1, host, port: gateway.port, fingerprint, pairCode, name }),
    link: (host) => `ostia-pair://${Buffer.from(JSON.stringify(gateway.payload(host))).toString('base64url')}`,
    mintCode: () => (pairCode = mintCode()),
    revoke: (deviceId) => {
      const index = devices.findIndex((d) => d.deviceId === deviceId);
      if (index < 0) return;
      const [device] = devices.splice(index, 1);
      saveDevices();
      connections.forEach((c) => c.device === device && c.socket.close(CLOSE_REVOKED, 'revoked'));
    },
    resizePane: (paneId, cols, rows) => {
      holds.delete(paneId);
      setSize(paneId, cols, rows);
    },
    setCaps: (deviceId, next) => {
      const device = devices.find((d) => d.deviceId === deviceId);
      if (!device) return;
      const removed = device.caps.some((cap) => !next.includes(cap));
      device.caps = canonical(next);
      connections.forEach((c) => {
        if (c.device !== device) return;
        if (removed) c.socket.close(CLOSE_CAPS_CHANGED, 'caps-changed');
        else c.socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'caps.changed', payload: { caps: device.caps } } }));
      });
    },
    updatePane,
    setSessionState,
    typed: (paneId) => typed.get(paneId) ?? [],
    pasted: (paneId) => pasted.get(paneId) ?? [],
    opened,
    screens,
    requestScreen: (sessionId, from) => {
      const requestId = `req-${++screenRequests}`;
      pendingRequests.add(requestId);
      event('screen.requested', { requestId, sessionId, ...(from ? { by: 'agent', ...from } : { by: 'desktop' }) }, 'notify');
      return requestId;
    },
    declined,
    writeArtifact: (sessionId, path, content) => {
      const tree = (scenario.artifacts[sessionId] ??= {});
      const change = content === null ? 'removed' : tree[path] === undefined ? 'added' : 'changed';
      if (content === null) delete tree[path];
      else tree[path] = content;
      touched.set(`${sessionId}:${path}`, Date.now());
      event('artifact.changed', { sessionId, path, change });
    },
    setAddresses: (next) => {
      addresses = next;
      event('addresses.changed', { addresses: next }, null);
    },
    move: async (wanted = 0) => {
      connections.forEach((c) => c.socket.terminate());
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      gateway.port = await listen(wanted);
      return gateway.port;
    },
    close: () =>
      new Promise<void>((resolve) => {
        connections.forEach((c) => c.socket.terminate());
        wss.close();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  return gateway;
}

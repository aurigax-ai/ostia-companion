import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Pane, SessionState } from '../model/workspaces.ts';
import { checkCode } from '../services/pairCheck.ts';
import { agentPromptScreen, demoScenario, PROMPT_OPTIONS, type Scenario, shellScreen } from './mockScenario.ts';

export type MockCap = 'read' | 'notify' | 'respond' | 'command' | 'input' | 'destructive';
export type MockDecision = 'approve' | 'deny' | 'never';

export interface MockGatewayOptions {
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
  log?: (line: string) => void;
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
  typed: (paneId: string) => string[];
  opened: string[];
  writeArtifact: (sessionId: string, path: string, content: string | null) => void;
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
    mkdirSync(dir, { recursive: true });
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
        '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=ostia-mock-gateway'],
      { stdio: 'ignore' },
    );
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
    log = () => {},
  } = options;
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
  const typed = new Map<string, string[]>();
  const opened: string[] = [];
  const touched = new Map<string, number>();
  const started = Date.now();
  let selected = 0;

  const mintCode = () => {
    const code = newCode();
    codes.set(code, Date.now());
    return code;
  };
  let pairCode = mintCode();

  const screenOf = (pane: Pane) =>
    pane.paneId === 'p-claude' ? agentPromptScreen(selected, pane.agentState === 'waiting' ? null : 0) : shellScreen(pane);
  scenario.panes.filter((pane) => pane.kind === 'terminal').forEach((pane) => output.set(pane.paneId, screenOf(pane)));

  const event = (type: string, payload: object, cap: MockCap = 'read') => {
    const frame = JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type, payload } });
    connections.forEach((c) => c.device?.caps.includes(cap) && c.socket.send(frame));
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
    const connection: Connection = { socket, device: null, attached: null, role: 'observer' };
    connections.add(connection);
    const helloTimer = setTimeout(() => socket.close(CLOSE_UNAUTHENTICATED, 'hello timeout'), helloTimeoutMs);
    const respond = (id: unknown, result: object) => socket.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
    const fail = (id: unknown, code: number, message: string, data?: object) =>
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } }));
    const has = (cap: MockCap) => connection.device?.caps.includes(cap) ?? false;

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
      const echoed = text.replace(/\r/g, '\r\n').replace(/\x7f/g, '\b \b').replace(/\x03/g, '^C\r\n');
      writePane(paneId, echoed);
    };

    socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        const type = data[0];
        if (type !== 0x02 && type !== 0x03) return;
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
        return respond(id, { deviceId: device.deviceId, caps: device.caps, desktop: { name, version: 'mock' } });
      }
      if (!connection.device) {
        fail(id, UNAUTHENTICATED, 'unauthenticated');
        return socket.close(CLOSE_UNAUTHENTICATED, 'unauthenticated');
      }
      if (method === 'artifact.open' && !has('command')) return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'command' });
      if (['ask.answer', 'agent.prompt', 'agent.interrupt'].includes(method) && !has('respond')) {
        return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'respond' });
      }
      if (['session.list', 'pane.list', 'pty.attach', 'pty.detach', 'ask.list', 'fs.list', 'fs.read'].includes(method) && !has('read')) {
        return fail(id, NEEDS_ELEVATION, 'needs-elevation', { cap: 'read' });
      }
      if (method === 'session.list') return respond(id, { sessions: scenario.sessions });
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
            return fail(id, INVALID_PARAMS, Object.keys(tree).some((file) => file.startsWith(`${path}/`)) ? 'not-a-file' : 'not-found');
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
        log(`ask: ${ask.askId} answered ${outcome}`);
        return respond(id, { ok: true });
      }
      if (method === 'agent.prompt' || method === 'agent.interrupt') {
        const pane = scenario.panes.find((p) => p.paneId === params.paneId);
        if (!pane?.agent || pane.agent === 'other') return fail(id, INVALID_PARAMS, 'not-an-agent');
        const keys = method === 'agent.prompt' ? `${params.text}\r` : params.key === 'ctrl-c' ? '\x03' : '\x1b';
        typed.set(pane.paneId, [...(typed.get(pane.paneId) ?? []), keys]);
        if (method === 'agent.prompt') writePane(pane.paneId, `\r\n\x1b[36m>\x1b[0m ${params.text}\r\n`);
        else writePane(pane.paneId, '\r\n\x1b[90m(interrupted)\x1b[0m\r\n');
        log(`agent: ${method} ${pane.paneId}`);
        return respond(id, { ok: true });
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
        return respond(id, { cursor: history.length, dropped: false, cols: 64, rows: 30, role: connection.role });
      }
      if (method === 'pty.detach') {
        connection.attached = null;
        return respond(id, {});
      }
      fail(id, METHOD_NOT_FOUND, 'method not found');
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      connections.delete(connection);
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '0.0.0.0', resolve));
  const port = (server.address() as AddressInfo).port;

  const gateway: MockGateway = {
    port,
    fingerprint,
    name,
    get pairCode() {
      return pairCode;
    },
    checkCodes,
    devices,
    payload: (host) => ({ v: 1, host, port, fingerprint, pairCode, name }),
    link: (host) => `ostia-pair://${Buffer.from(JSON.stringify(gateway.payload(host))).toString('base64url')}`,
    mintCode: () => (pairCode = mintCode()),
    revoke: (deviceId) => {
      const index = devices.findIndex((d) => d.deviceId === deviceId);
      if (index < 0) return;
      const [device] = devices.splice(index, 1);
      saveDevices();
      connections.forEach((c) => c.device === device && c.socket.close(CLOSE_REVOKED, 'revoked'));
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
    opened,
    writeArtifact: (sessionId, path, content) => {
      const tree = (scenario.artifacts[sessionId] ??= {});
      const change = content === null ? 'removed' : tree[path] === undefined ? 'added' : 'changed';
      if (content === null) delete tree[path];
      else tree[path] = content;
      touched.set(`${sessionId}:${path}`, Date.now());
      event('artifact.changed', { sessionId, path, change });
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

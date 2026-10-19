import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockGateway } from '../src/testing/mockGateway.ts';

const decision = (process.env.MOCK_DECISION ?? 'approve') as 'approve' | 'deny' | 'never';
const gateway = await startMockGateway({
  port: Number(process.env.MOCK_PORT ?? 8723),
  name: process.env.MOCK_NAME ?? 'Mock desktop',
  caps: ['read', 'notify', 'respond', 'command', 'input'],
  decision,
  approveAfterMs: Number(process.env.MOCK_APPROVE_MS ?? 4000),
  reusableCode: true,
  devicesFile: join(tmpdir(), `ostia-mock-devices-${process.env.MOCK_PORT ?? 8723}.json`),
  ...(process.env.MOCK_PHONE_WORKSPACE ? { phoneWorkspace: { sessionId: process.env.MOCK_PHONE_WORKSPACE, agent: 'claude' as const } } : {}),
  log: (line) => console.log(line),
  onScreen: (screen) => {
    const folder = process.env.MOCK_SAVE_SCREENS ? join(tmpdir(), 'ostia-mock-screens') : null;
    const file = folder ? join(folder, `${screen.screenId}.jpg`) : null;
    if (folder) mkdirSync(folder, { recursive: true });
    const timer = setInterval(async () => {
      if (screen.closed) {
        if (file) rmSync(file, { force: true });
        return clearInterval(timer);
      }
      const reply = await screen.request('phone.capture', { maxSide: 800 });
      if (!reply.result) return console.log(`screen: capture ${reply.error?.message}`);
      if (file) writeFileSync(file, Buffer.from(reply.result.data, 'base64'));
      console.log(`screen: ${reply.result.width}x${reply.result.height} of ${reply.result.screenWidth}x${reply.result.screenHeight}${file ? ` → ${file}` : ''}`);
    }, 3000);
  },
});

const code = `${gateway.pairCode.slice(0, 4)}-${gateway.pairCode.slice(4)}`;
console.log(`Mock Ostia gateway on :${gateway.port}  pairing code ${code}  decision ${decision}`);
console.log(`Android emulator:\n  ${gateway.link('10.0.2.2')}`);
for (const address of Object.values(networkInterfaces()).flat()) {
  if (address && address.family === 'IPv4' && !address.internal) {
    console.log(`Phone on ${address.address}:\n  ${gateway.link(address.address)}`);
  }
}

process.on('SIGUSR1', () => gateway.devices.slice().forEach((device) => gateway.revoke(device.deviceId)));
process.on('SIGUSR2', () => gateway.screens.filter((screen) => !screen.closed).forEach((screen) => void screen.request('phone.stop')));
console.log(`kill -USR1 ${process.pid} revokes every phone; kill -USR2 ${process.pid} stops every phone screen`);

const drivePort = Number(process.env.MOCK_DRIVE_PORT ?? 8724);
createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    if (req.method === 'POST' && req.url === '/requested') {
      const asked = JSON.parse(body || '{}');
      gateway.requestScreen(asked.sessionId ?? 's-api', asked.reason ? { agent: asked.agent ?? 'claude', reason: asked.reason } : undefined);
      return res.writeHead(200).end('{}');
    }
    const screen = gateway.screens.findLast((s) => !s.closed);
    if (req.method !== 'POST' || !screen) return res.writeHead(404).end();
    try {
      const { method, params } = JSON.parse(body);
      const reply = await screen.request(method, params ?? {});
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply));
    } catch {
      res.writeHead(400).end();
    }
  });
}).listen(drivePort, '127.0.0.1');
console.log(`Drive the linked phone: curl -d '{"method":"phone.tree"}' http://127.0.0.1:${drivePort}/`);

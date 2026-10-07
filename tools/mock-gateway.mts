import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockGateway } from '../src/testing/mockGateway.ts';

const decision = (process.env.MOCK_DECISION ?? 'approve') as 'approve' | 'deny' | 'never';
const gateway = await startMockGateway({
  port: Number(process.env.MOCK_PORT ?? 8723),
  name: process.env.MOCK_NAME ?? 'Mock desktop',
  caps: ['read', 'notify', 'command', 'input'],
  decision,
  approveAfterMs: Number(process.env.MOCK_APPROVE_MS ?? 4000),
  reusableCode: true,
  devicesFile: join(tmpdir(), `ostia-mock-devices-${process.env.MOCK_PORT ?? 8723}.json`),
  log: (line) => console.log(line),
});

const code = `${gateway.pairCode.slice(0, 4)}-${gateway.pairCode.slice(4)}`;
console.log(`Mock Ostia gateway on :${gateway.port}  pairing code ${code}  decision ${decision}`);
console.log(`Android emulator:\n  ${gateway.link('10.0.2.2')}`);
for (const address of Object.values(networkInterfaces()).flat()) {
  if (address && address.family === 'IPv4' && !address.internal) {
    console.log(`Phone on ${address.address}:\n  ${gateway.link(address.address)}`);
  }
}

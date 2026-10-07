import { afterEach, describe, expect, it } from 'vitest';
import { connect, pair } from './contractClient';
import { MockCap, MockGateway, startMockGateway } from './mockGateway';

let gateway: MockGateway | null = null;

afterEach(async () => {
  await gateway?.close();
  gateway = null;
});

async function phone(caps: MockCap[]) {
  gateway = await startMockGateway({ caps });
  const { result } = await pair(gateway);
  const client = connect(gateway);
  await client.call('hello', { deviceToken: result.deviceToken });
  return client;
}

describe('files (contract v1.5)', () => {
  it('FIL-C1 lists the workspace root with name, kind, size and mtime', async () => {
    const client = await phone(['read', 'notify']);
    const { result } = await client.call('fs.list', { sessionId: 's-ostia', path: '' });
    expect(result.entries.length).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry).toEqual({ name: expect.any(String), kind: expect.stringMatching(/^(file|dir|link)$/), size: expect.any(Number), mtime: expect.any(Number) });
    }
    expect(result.entries.map((e: any) => e.name)).toContain('src');
  });

  it('FIL-C2 refuses paths outside the workspace and reads nothing', async () => {
    const client = await phone(['read', 'notify']);
    for (const call of [
      await client.call('fs.list', { sessionId: 's-ostia', path: '../../etc' }),
      await client.call('fs.read', { sessionId: 's-ostia', path: '../secrets.txt' }),
      await client.call('fs.read', { sessionId: 's-ostia', path: '/etc/passwd' }),
    ]) {
      expect(call.error).toEqual(expect.objectContaining({ code: -32602, message: 'outside-workspace' }));
    }
  });

  it('FIL-C3 returns 256 KB of a 300 KB file, marked truncated', async () => {
    const client = await phone(['read', 'notify']);
    const { result } = await client.call('fs.read', { sessionId: 's-ostia', path: 'logs/build.log' });
    expect(result.size).toBe(300 * 1024);
    expect(result.text.length).toBe(256 * 1024);
    expect(result.truncated).toBe(true);
  });

  it('FIL-C4 needs read to list files', async () => {
    const client = await phone(['notify']);
    const reply = await client.call('fs.list', { sessionId: 's-ostia', path: '' });
    expect(reply.error).toEqual(expect.objectContaining({ code: -32003, data: { cap: 'read' } }));
  });
});

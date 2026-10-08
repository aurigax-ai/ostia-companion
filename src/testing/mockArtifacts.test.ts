import { afterEach, describe, expect, it } from 'vitest';
import { readWhole } from '../model/files';
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

const artifacts = { sessionId: 's-ostia', root: 'artifacts' };
const slices = (client: { call: (method: string, params: object) => Promise<any> }, path: string) => async (offset: number) =>
  (await client.call('fs.read', { ...artifacts, path, offset })).result;

describe('artifacts (contract v1.7)', () => {
  it('ART-K1 lists the artifact folder, sorted by name, without a link', async () => {
    const client = await phone(['read', 'notify']);
    const { result } = await client.call('fs.list', { ...artifacts, path: '' });
    const names = result.entries.map((e: any) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual(expect.arrayContaining(['PAD.md', 'release-plan.md', 'dashboard']));
    expect(names).not.toContain('README.md');
    for (const entry of result.entries) {
      expect(entry).toEqual({ name: expect.any(String), kind: expect.stringMatching(/^(file|dir)$/), size: expect.any(Number), mtime: expect.any(Number) });
    }
  });

  it('ART-K2 keeps the workspace root as the default, unchanged for a phone that sends no root', async () => {
    const client = await phone(['read', 'notify']);
    const listed = await client.call('fs.list', { sessionId: 's-ostia', path: '' });
    expect(listed.result.entries.map((e: any) => e.name)).toContain('README.md');
    const read = await client.call('fs.read', { sessionId: 's-ostia', path: 'README.md' });
    expect(read.result).toEqual({ text: '# ostia\n\nA terminal for agents.\n', size: 32, truncated: false });
    expect((await client.call('fs.read', { sessionId: 's-ostia', path: 'README.md', root: 'workspace' })).result).toEqual(read.result);
  });

  it('ART-K3 lists one level down as files only, and nothing deeper', async () => {
    const client = await phone(['read', 'notify']);
    const page = await client.call('fs.list', { ...artifacts, path: 'dashboard' });
    expect(page.result.entries.map((e: any) => [e.name, e.kind])).toEqual([['data.json', 'file'], ['index.html', 'file']]);
    for (const call of [
      await client.call('fs.list', { ...artifacts, path: 'dashboard/deep' }),
      await client.call('fs.read', { ...artifacts, path: 'dashboard/deep/more.txt' }),
      await client.call('fs.read', { ...artifacts, path: 'missing.md' }),
    ]) {
      expect(call.error).toEqual(expect.objectContaining({ code: -32602, message: 'not-found' }));
    }
  });

  it('ART-K4 refuses a path that leaves the folder, an unknown root and an unknown workspace', async () => {
    const client = await phone(['read', 'notify']);
    const outside = await client.call('fs.read', { ...artifacts, path: '../README.md' });
    expect(outside.error).toEqual(expect.objectContaining({ code: -32602, message: 'outside-workspace' }));
    const root = await client.call('fs.list', { sessionId: 's-ostia', path: '', root: 'home' });
    expect(root.error).toEqual(expect.objectContaining({ code: -32602, message: 'invalid-root' }));
    const session = await client.call('fs.list', { sessionId: 'nope', path: '', root: 'artifacts' });
    expect(session.error).toEqual(expect.objectContaining({ code: -32602, message: 'unknown-session' }));
  });

  it('ART-K5 answers an empty list for an empty folder and not-found for a workspace without one', async () => {
    const client = await phone(['read', 'notify']);
    expect((await client.call('fs.list', { sessionId: 's-web', path: '', root: 'artifacts' })).result).toEqual({ entries: [] });
    const none = await client.call('fs.list', { sessionId: 's-api', path: '', root: 'artifacts' });
    expect(none.error).toEqual(expect.objectContaining({ code: -32602, message: 'not-found' }));
  });

  it('ART-K6 reads a 600 KB text file whole: text first, then base64 slices', async () => {
    const client = await phone(['read', 'notify']);
    const kinds: string[] = [];
    const whole = await readWhole(
      async (offset) => {
        const result = await slices(client, 'trace.log')(offset);
        kinds.push(result.text !== undefined ? 'text' : 'base64');
        return result;
      },
      'text',
      2 * 1024 * 1024,
    );
    expect(whole.complete).toBe(true);
    expect(whole.text).toBe('héllo wörld €\n'.repeat(40_000));
    expect(whole.size).toBe(Buffer.byteLength(whole.text!));
    expect(kinds).toEqual(['text', 'base64', 'base64']);
  });

  it('ART-K7 reads an image over 256 KB as slices that join into its bytes', async () => {
    const client = await phone(['read', 'notify']);
    const whole = await readWhole(slices(client, 'shot.png'), 'bytes', 16 * 1024 * 1024);
    expect(whole.complete).toBe(true);
    expect(whole.size).toBe(360_000);
    expect(atob(whole.base64!)).toBe('\u0089PNG\u0000\u0001'.repeat(60_000));
  });

  it('ART-K8 answers an empty base64 slice at or past the end', async () => {
    const client = await phone(['read', 'notify']);
    const end = await client.call('fs.read', { ...artifacts, path: 'PAD.md', offset: 9999 });
    expect(end.result).toEqual({ base64: '', size: expect.any(Number), truncated: false });
  });

  it('ART-K9 needs read to list or read artifacts', async () => {
    const client = await phone(['notify']);
    for (const method of ['fs.list', 'fs.read']) {
      const reply = await client.call(method, { ...artifacts, path: 'PAD.md' });
      expect(reply.error).toEqual(expect.objectContaining({ code: -32003, data: { cap: 'read' } }));
    }
  });

  it('ART-K10 sends artifact.changed to a phone with read, with the path fs.read takes', async () => {
    const client = await phone(['read', 'notify']);
    gateway!.writeArtifact('s-ostia', 'dashboard/new.md', '# new\n');
    gateway!.writeArtifact('s-ostia', 'dashboard/new.md', '# newer\n');
    gateway!.writeArtifact('s-ostia', 'dashboard/new.md', null);
    await client.settle();
    expect(client.unsolicited.map((m) => m.params)).toEqual(
      ['added', 'changed', 'removed'].map((change) => ({ type: 'artifact.changed', payload: { sessionId: 's-ostia', path: 'dashboard/new.md', change } })),
    );
  });

  it('ART-K11 sends no artifact.changed to a phone without read', async () => {
    const client = await phone(['notify']);
    gateway!.writeArtifact('s-ostia', 'a.md', 'a');
    await client.settle();
    expect(client.unsolicited).toEqual([]);
  });

  it('ART-K12 has no method that writes an artifact', async () => {
    const client = await phone(['read', 'notify', 'respond', 'command', 'input', 'destructive']);
    for (const method of ['fs.write', 'pad.append']) {
      const reply = await client.call(method, { ...artifacts, path: 'PAD.md', text: 'x' });
      expect(reply.error).toEqual(expect.objectContaining({ code: -32601 }));
    }
  });

  it('ART-K13 opens an artifact on the desktop only for a phone with command', async () => {
    const reader = await phone(['read', 'notify']);
    const denied = await reader.call('artifact.open', { sessionId: 's-ostia', path: 'dashboard/index.html' });
    expect(denied.error).toEqual(expect.objectContaining({ code: -32003, data: { cap: 'command' } }));
    expect(gateway!.opened).toEqual([]);
  });

  it('ART-K14 opens only a file inside the artifact folder', async () => {
    const client = await phone(['read', 'notify', 'command']);
    expect((await client.call('artifact.open', { sessionId: 's-ostia', path: 'dashboard/index.html' })).result).toEqual({ ok: true });
    for (const [path, message] of [['nope.html', 'not-found'], ['../README.md', 'outside-workspace'], ['dashboard', 'not-a-file'], ['dashboard/deep/more.txt', 'not-found']]) {
      const reply = await client.call('artifact.open', { sessionId: 's-ostia', path });
      expect(reply.error).toEqual(expect.objectContaining({ code: -32602, message }));
    }
    expect(gateway!.opened).toEqual(['s-ostia:dashboard/index.html']);
  });
});

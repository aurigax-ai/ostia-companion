import { afterEach, describe, expect, it } from 'vitest';
import { connect, pair } from './contractClient';
import { MockGateway, MockGatewayOptions, MockScreenLink, startMockGateway } from './mockGateway';

let gateway: MockGateway | null = null;

afterEach(async () => {
  await gateway?.close();
  gateway = null;
});

async function linked(options: MockGatewayOptions = {}, start: object = {}) {
  gateway = await startMockGateway(options);
  const { result } = await pair(gateway);
  const client = connect(gateway);
  await client.call('hello', { deviceToken: result.deviceToken, client: 'test' });
  const answer = await client.call('screen.start', {
    sessionId: 's-api',
    label: 'api-server',
    width: 1080,
    height: 2400,
    density: 2.75,
    rotation: 0,
    level: 'view',
    limitSec: 900,
    endsAt: Date.now() + 900_000,
    overlayHeight: 0,
    ...start,
  });
  return { gw: gateway, client, answer, result };
}

const screenOf = (gw: MockGateway): MockScreenLink => gw.screens[gw.screens.length - 1];

describe('mock gateway: phone screen link (contract v1.8)', () => {
  it('turns a second socket into a screen link and asks it for a capture', async () => {
    const { gw, client, answer } = await linked();
    expect(answer.result.screenId).toMatch(/^scr_/);
    client.serve((method, params) =>
      method === 'phone.capture'
        ? { result: { width: params.maxSide, height: 2, screenWidth: 1080, screenHeight: 2400, mime: 'image/jpeg', data: 'AQID', blocked: false } }
        : { error: { code: -32010, message: 'view-only' } },
    );
    const capture = await screenOf(gw).request('phone.capture', { maxSide: 800 });
    expect(capture.result).toMatchObject({ width: 800, screenWidth: 1080, mime: 'image/jpeg' });
    const tap = await screenOf(gw).request('phone.tap', { x: 1, y: 2 });
    expect(tap.error.message).toBe('view-only');
  });

  it('collects state events and binary screen frames from the phone', async () => {
    const { gw, client } = await linked();
    client.notify('screen.state', { state: 'stopped', reason: 'time-limit', width: 1080, height: 2400, rotation: 0, endsAt: 1 });
    const header = Buffer.from(JSON.stringify({ seq: 0, width: 10, height: 20, screenWidth: 1080, screenHeight: 2400, blocked: false }));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(header.length);
    client.socket.send(Buffer.concat([Buffer.from([0x10]), length, header, Buffer.from([0xff, 0xd8])]));
    await client.settle();
    expect(screenOf(gw).events).toEqual([expect.objectContaining({ type: 'screen.state', payload: expect.objectContaining({ reason: 'time-limit' }) })]);
    expect(screenOf(gw).frames[0].header.screenWidth).toBe(1080);
    expect([...screenOf(gw).frames[0].jpeg]).toEqual([0xff, 0xd8]);
  });

  it('refuses a second link from the same phone as busy', async () => {
    const { gw, result } = await linked();
    const second = connect(gw);
    await second.call('hello', { deviceToken: result.deviceToken });
    const answer = await second.call('screen.start', { ...screenOf(gw).start });
    expect(answer.error.message).toBe('busy');
  });

  it('refuses unknown workspaces, odd limits and a desktop with no controller', async () => {
    expect((await linked({}, { sessionId: 's-nope' })).answer.error.message).toBe('unknown-session');
    await gateway?.close();
    expect((await linked({}, { limitSec: 60 })).answer.error.message).toBe('bad-params');
    await gateway?.close();
    const none = await linked({ screenController: false });
    expect(none.answer.error).toEqual({ code: -32004, message: 'no-controller' });
  });

  it('PHC-C6 ends the link when the phone is revoked', async () => {
    const { gw, client } = await linked();
    gw.revoke(gw.devices[0].deviceId);
    expect(await client.closed).toBe(4003);
    await client.settle();
    expect(screenOf(gw).closed).toBe(true);
  });

  it('PHC-C19 asks a phone with notify for a session and starts nothing', async () => {
    const { gw, client } = await linked();
    gw.requestScreen('s-api');
    await client.settle();
    expect(client.unsolicited).toContainEqual(
      expect.objectContaining({ method: 'event', params: { type: 'screen.requested', payload: { sessionId: 's-api', by: 'desktop' } } }),
    );
    expect(gw.screens).toHaveLength(1);
  });

  it('closes the link 5 s after endsAt', async () => {
    const { client } = await linked({}, { endsAt: Date.now() - 4950 });
    expect(await client.closed).toBe(4005);
  });

  it('answers any other method on a link as link-only, but still takes asks', async () => {
    const { client } = await linked();
    expect((await client.call('pane.list')).error).toEqual({ code: -32600, message: 'link-only' });
    expect((await client.call('ask.list')).result.asks).toEqual(expect.any(Array));
  });
});

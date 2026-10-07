import { describe, expect, it } from 'vitest';
import { connectionNotice } from './connectionNotice';
import { pairFailure } from './pairFailure';

describe('connection notice', () => {
  it('CRD-C9 an unreachable tailnet host points at Tailscale and offers Open Tailscale and Retry', () => {
    const notice = connectionNotice('disconnected', '100.87.12.4', 'studio-linux');
    expect(notice?.text).toMatch(/Tailscale/);
    expect(notice?.actions).toEqual(['open-tailscale', 'retry']);
  });

  it('CRD-C10 an unreachable LAN host names the address, never Tailscale, and offers Retry', () => {
    const notice = connectionNotice('disconnected', '192.168.1.20', "Marco's MacBook");
    expect(notice?.text).toMatch(/Marco's MacBook at 192\.168\.1\.20/);
    expect(notice?.text).not.toMatch(/Tailscale|tailnet/i);
    expect(notice?.actions).toContain('retry');
    expect(notice?.actions).not.toContain('open-tailscale');
  });

  it('CRD-C11 a failed pairing with a LAN host never mentions Tailscale', () => {
    const failure = pairFailure('Network request failed', '192.168.1.20', 8722);
    expect(failure.text).toMatch(/192\.168\.1\.20:8722/);
    expect(failure.text).not.toMatch(/Tailscale|tailnet/i);
  });

  it('CRD-C12 a phone the desktop removed is offered only Pair again', () => {
    const notice = connectionNotice('revoked', '192.168.1.20', "Marco's MacBook");
    expect(notice?.actions).toEqual(['pair-again']);
    expect(notice?.text).toMatch(/Marco's MacBook/);
  });
});

import { addEntry, formatLog, LogEntry } from '../model/connectionLog';
import { OstiaRpc } from './rpc';

let log: LogEntry[] = [];
let started = false;

export function logEvent(text: string): void {
  const pairing = OstiaRpc.getPairing();
  log = addEntry(log, text, Date.now(), [pairing?.deviceToken ?? '', pairing?.privateKey ?? '']);
}

export function startConnectionLog(): void {
  if (started) return;
  started = true;
  OstiaRpc.addStatusListener((status, reason) => {
    const pairing = OstiaRpc.getPairing();
    const where = pairing ? ` ${pairing.gatewayHost}:${pairing.gatewayPort}` : '';
    logEvent(`${status}${where}${reason ? `: ${reason}` : ''}`);
  });
  OstiaRpc.addEventListener((type, payload) => {
    if (type === 'rpc.error') logEvent(`rpc error ${payload?.code ?? ''} ${payload?.message ?? ''}`.trim());
  });
}

export function connectionLogText(): string {
  return formatLog(log) || 'No connection events yet.';
}

import type { PairingData } from '../services/storage';

export type AddressKind = 'tailnet' | 'phone' | 'lan';

export interface DesktopAddress {
  kind: AddressKind;
  host: string;
  port: number;
}

export interface Route {
  host: string;
  port: number;
}

const KINDS: AddressKind[] = ['tailnet', 'phone', 'lan'];
const HOST = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function validPort(port: unknown): port is number {
  return Number.isInteger(port) && (port as number) >= 1 && (port as number) <= 65535;
}

export function parseAddresses(value: unknown): DesktopAddress[] | null {
  if (!Array.isArray(value)) return null;
  const usable = value.flatMap((entry) => {
    const { kind, host, port } = entry ?? {};
    if (!KINDS.includes(kind) || typeof host !== 'string' || !HOST.test(host) || !validPort(port)) return [];
    return [{ kind, host, port }];
  });
  return usable.length === 0 && value.length > 0 ? null : usable;
}

export function routeKey(route: Route): string {
  return `${route.host.toLowerCase()}:${route.port}`;
}

function distinct(routes: Route[]): Route[] {
  const seen = new Set<string>();
  return routes.filter((route) => !seen.has(routeKey(route)) && seen.add(routeKey(route)));
}

export function savedRoutes(desktop: PairingData): Route[] {
  const last = { host: desktop.gatewayHost, port: desktop.gatewayPort };
  return distinct([last, ...(desktop.addresses ?? []).map(({ host, port }) => ({ host, port }))]);
}

export function untried(found: Route[], tried: Route[]): Route[] {
  const done = new Set(tried.map(routeKey));
  return distinct(found).filter((route) => !done.has(routeKey(route)));
}

export function pairedRoute(service: { txt?: Record<string, string>; addresses?: string[] }): Route | null {
  const { v, mode, port } = service.txt ?? {};
  const portNumber = Number(port);
  if (v !== '1' || mode !== 'paired' || !validPort(portNumber)) return null;
  const host = (service.addresses ?? []).find((address) => IPV4.test(address));
  return host ? { host, port: portNumber } : null;
}

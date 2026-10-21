import type { PairingData } from '../services/storage';

type AddressKind = 'tailnet' | 'phone' | 'lan' | 'relay';

export interface DesktopAddress {
  kind: AddressKind;
  host: string;
  port: number;
}

export interface Route {
  host: string;
  port: number;
  kind?: AddressKind;
}

const KINDS: AddressKind[] = ['tailnet', 'phone', 'lan', 'relay'];
const HOST = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function validPort(port: unknown): port is number {
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

function routeKey(route: Route): string {
  return `${route.host.toLowerCase()}:${route.port}`;
}

function distinct(routes: Route[]): Route[] {
  const seen = new Set<string>();
  return routes.filter((route) => !seen.has(routeKey(route)) && seen.add(routeKey(route)));
}

function asRoute({ host, port, kind }: Route): Route {
  return kind === 'relay' ? { host, port, kind } : { host, port };
}

export function savedRoutes(desktop: PairingData): Route[] {
  const saved: Route[] = desktop.addresses ?? [];
  const last: Route = { host: desktop.gatewayHost, port: desktop.gatewayPort };
  const kind = saved.find((route) => routeKey(route) === routeKey(last))?.kind;
  const routes = distinct([asRoute({ ...last, kind }), ...saved.map(asRoute)]);
  return [...routes.filter((route) => route.kind !== 'relay'), ...routes.filter((route) => route.kind === 'relay')];
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

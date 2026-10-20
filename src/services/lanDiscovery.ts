import Zeroconf from 'react-native-zeroconf';
import { pairedRoute, Route } from '../model/rediscovery';
import { SERVICE_TYPE } from './discovery';

export const LAN_SEARCH_MS = 3000;

export function discoverPairedRoutes(): Promise<Route[]> {
  return new Promise((resolve) => {
    const zeroconf = new Zeroconf();
    const found: Route[] = [];
    zeroconf.subscribe('resolved', (service) => {
      const route = pairedRoute(service);
      if (route) found.push(route);
    });
    zeroconf.scan({ type: SERVICE_TYPE, protocol: 'tcp', domain: 'local.' });
    setTimeout(() => {
      zeroconf.stop();
      zeroconf.removeDeviceListeners();
      resolve(found);
    }, LAN_SEARCH_MS);
  });
}

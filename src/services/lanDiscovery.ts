import * as Network from 'expo-network';
import Zeroconf from 'react-native-zeroconf';
import { pairedRoute, Route } from '../model/rediscovery';
import { SEARCH_MS, SERVICE_TYPE } from './discovery';

export async function onWifi(): Promise<boolean> {
  try {
    return (await Network.getNetworkStateAsync()).type === Network.NetworkStateType.WIFI;
  } catch {
    return false;
  }
}

export function discoverPairedRoutes(): Promise<Route[]> {
  return new Promise((resolve) => {
    const zeroconf = new Zeroconf();
    const found: Route[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (timer) clearTimeout(timer);
      zeroconf.stop();
      zeroconf.removeDeviceListeners();
      resolve(found);
    };
    try {
      zeroconf.subscribe('resolved', (service) => {
        const route = pairedRoute(service);
        if (route) found.push(route);
      });
      zeroconf.scan({ type: SERVICE_TYPE, protocol: 'tcp', domain: 'local.' });
      timer = setTimeout(finish, SEARCH_MS);
    } catch {
      finish();
    }
  });
}

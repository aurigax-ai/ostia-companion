import * as Network from 'expo-network';
import Zeroconf from 'react-native-zeroconf';
import { pairedRoute, Route } from '../model/rediscovery';
import { SEARCH_MS, SERVICE_TYPE } from './discovery';

const NO_LOCAL_NETWORK: (Network.NetworkStateType | undefined)[] = [
  Network.NetworkStateType.NONE,
  Network.NetworkStateType.UNKNOWN,
  Network.NetworkStateType.CELLULAR,
];

export async function onLocalNetwork(): Promise<boolean> {
  try {
    return !NO_LOCAL_NETWORK.includes((await Network.getNetworkStateAsync()).type);
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

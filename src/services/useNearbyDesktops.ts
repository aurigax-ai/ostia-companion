import { useEffect, useState } from 'react';
import Zeroconf from 'react-native-zeroconf';
import { desktopFromService, NearbyDesktop, nearbyState, SEARCH_MS, SERVICE_TYPE } from './discovery';

export function useNearbyDesktops() {
  const [found, setFound] = useState<Record<string, NearbyDesktop>>({});
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const zeroconf = new Zeroconf();
    const offResolved = zeroconf.subscribe('resolved', (service) => {
      const desktop = desktopFromService(service);
      if (desktop) setFound((all) => ({ ...all, [service.name]: desktop }));
    });
    const offRemoved = zeroconf.subscribe('remove', (name) =>
      setFound((all) => {
        const { [name]: _gone, ...rest } = all;
        return rest;
      }),
    );
    zeroconf.scan({ type: SERVICE_TYPE, protocol: 'tcp', domain: 'local.' });
    const timer = setTimeout(() => setElapsed(SEARCH_MS), SEARCH_MS);
    return () => {
      clearTimeout(timer);
      offResolved();
      offRemoved();
      zeroconf.stop();
      zeroconf.removeDeviceListeners();
    };
  }, []);

  const desktops = Object.values(found);
  return { desktops, state: nearbyState(desktops, elapsed) };
}

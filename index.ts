import { registerRootComponent } from 'expo';
import { getRandomValues } from 'expo-crypto';

// Hermes has no Web Crypto; the pairing flow draws its nonces from crypto.getRandomValues.
(globalThis as { crypto?: object }).crypto ??= { getRandomValues };

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

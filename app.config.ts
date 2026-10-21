import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...config,
    name: config.name ?? 'Ostia',
    slug: config.slug ?? 'ostia',
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};

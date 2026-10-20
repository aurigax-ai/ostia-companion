const host = globalThis as { process?: { title?: string } };
if (host.process && !('title' in host.process)) host.process.title = 'react-native';

import { File, Paths } from 'expo-file-system';
import { pruneRaised } from '../model/pushWake';

const raisedFile = () => new File(Paths.document, 'ostia-raised-alerts.json');

async function load(): Promise<Record<string, number>> {
  try {
    const file = raisedFile();
    if (!file.exists) return {};
    return pruneRaised(JSON.parse(await file.text()), Date.now());
  } catch {
    return {};
  }
}

let queue: Promise<unknown> = Promise.resolve();

export function rememberRaised(id: string): Promise<void> {
  const run = queue.then(async () => {
    const raised = pruneRaised({ ...(await load()), [id]: Date.now() }, Date.now());
    const file = raisedFile();
    file.create({ overwrite: true });
    file.write(JSON.stringify(raised));
  });
  queue = run.catch(() => {});
  return run.catch(() => {});
}

export async function raisedIds(): Promise<string[]> {
  await queue;
  return Object.keys(await load());
}

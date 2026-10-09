import { FileContent, FileEntry, FileTarget } from '../model/files';
import { OstiaRpc } from './rpc';

export const METHOD_NOT_FOUND = -32601;
export const NEEDS_ELEVATION = -32003;
const UNKNOWN_ROOT = '?';

let artifactsKnown = false;
let watching = false;

function params({ sessionId, path, root }: FileTarget) {
  return root === 'artifacts' ? { sessionId, path, root } : { sessionId, path };
}

async function requireArtifacts(sessionId: string) {
  if (artifactsKnown) return;
  if (!watching) {
    watching = true;
    OstiaRpc.addStatusListener(() => (artifactsKnown = false));
  }
  try {
    await OstiaRpc.call('fs.list', { sessionId, path: '', root: UNKNOWN_ROOT });
  } catch (err: any) {
    if (err?.message !== 'invalid-root') throw err;
    artifactsKnown = true;
    return;
  }
  throw { code: METHOD_NOT_FOUND, message: 'method not found' };
}

export async function listFiles(target: FileTarget): Promise<FileEntry[]> {
  if (target.root === 'artifacts') await requireArtifacts(target.sessionId);
  try {
    return (await OstiaRpc.call('fs.list', params(target))).entries ?? [];
  } catch (err: any) {
    if (target.root === 'artifacts' && target.path === '' && err?.message === 'not-found') return [];
    throw err;
  }
}

export async function readPiece(target: FileTarget, offset: number): Promise<FileContent> {
  if (target.root === 'artifacts') await requireArtifacts(target.sessionId);
  return OstiaRpc.call('fs.read', offset > 0 ? { ...params(target), offset } : params(target));
}

export function openOnDesktop({ sessionId, path }: FileTarget): Promise<unknown> {
  return OstiaRpc.call('artifact.open', { sessionId, path });
}

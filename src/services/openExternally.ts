import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { FileTarget, WHOLE_BYTES_LIMIT, formatSize, mimeType, readWhole } from '../model/files';
import { readPiece } from './files';

export async function openExternally(target: FileTarget, name: string): Promise<void> {
  const file = await readWhole((offset) => readPiece(target, offset), 'bytes', WHOLE_BYTES_LIMIT);
  if (!file.complete) throw { code: -1, message: `${formatSize(file.size)} is too large to open on the phone. Open it on the desktop.` };
  const copy = new File(Paths.cache, name);
  copy.create({ overwrite: true });
  copy.write(file.base64 ?? '', { encoding: 'base64' });
  await Sharing.shareAsync(copy.uri, { mimeType: mimeType(name) });
}

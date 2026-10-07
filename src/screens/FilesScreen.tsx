import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { File, Folder, FolderOpen } from 'lucide-react-native';
import { Button, Divider, Empty, GroupItem, HeaderTitle, IconTile, ListRow, Loading, TILE_INSET } from '../components/ui';
import { FileEntry, formatSize, sortEntries } from '../model/files';
import { ScreenProps } from '../navigation';
import { OstiaRpc } from '../services/rpc';

const METHOD_NOT_FOUND = -32601;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: FileEntry[] }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export function FilesScreen({ navigation, route }: ScreenProps<'Files'>) {
  const { sessionId, path, title } = route.params;
  const [state, setState] = useState<State>({ kind: 'loading' });

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: () => <HeaderTitle title={title} subtitle={path || undefined} mono /> });
  }, [navigation, title, path]);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const result = await OstiaRpc.call('fs.list', { sessionId, path });
      setState({ kind: 'ready', entries: sortEntries(result.entries ?? []) });
    } catch (err: any) {
      setState(err?.code === METHOD_NOT_FOUND ? { kind: 'unsupported' } : { kind: 'error', message: err?.message || "Couldn't list files" });
    }
  }, [sessionId, path]);

  useEffect(() => void load(), [load]);

  if (state.kind === 'loading') return <Loading />;
  if (state.kind === 'unsupported') {
    return <Empty title="Files aren't available" body="This desktop can't share files yet. Update Ostia on the desktop." />;
  }
  if (state.kind === 'error') {
    return <Empty title="Couldn't list files" body={state.message} action={<Button label="Try again" variant="tonal" onPress={() => void load()} />} />;
  }

  const join = (name: string) => (path ? `${path}/${name}` : name);

  return (
    <FlatList
      data={state.entries}
      keyExtractor={(entry) => entry.name}
      ItemSeparatorComponent={() => <Divider inset={TILE_INSET} />}
      contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
      ListEmptyComponent={<Empty icon={FolderOpen} title="Empty folder" body="This folder is empty." />}
      renderItem={({ item: entry, index }) => (
        <GroupItem first={index === 0} last={index === state.entries.length - 1}>
        <ListRow
          leading={<IconTile icon={entry.kind === 'dir' ? Folder : File} />}
          title={entry.name}
          subtitle={entry.kind === 'dir' ? undefined : formatSize(entry.size)}
          mono
          onPress={() =>
            entry.kind === 'dir'
              ? navigation.push('Files', { sessionId, path: join(entry.name), title: entry.name })
              : navigation.navigate('FileView', { sessionId, path: join(entry.name), name: entry.name })
          }
        />
        </GroupItem>
      )}
    />
  );
}

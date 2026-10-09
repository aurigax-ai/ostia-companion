import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { File, FileCode, FileText, Folder, Image as ImageIcon, LucideIcon, NotebookPen, Table, Workflow } from 'lucide-react-native';
import { Button, Divider, Empty, GroupItem, HeaderTitle, IconTile, ListRow, Loading, TILE_INSET } from '../components/ui';
import { PAD_FILE, PAD_TITLE, formatAge, isArtifactUnread, sortArtifacts } from '../model/artifacts';
import { FileEntry, ViewerKind, formatSize, viewerKind } from '../model/files';
import { ScreenProps } from '../navigation';
import { useArtifacts } from '../services/artifactStore';
import { METHOD_NOT_FOUND, listFiles } from '../services/files';
import { colors, space, type } from '../theme';

type Row = { pad: true; entry?: FileEntry } | { pad: false; entry: FileEntry };

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: Row[] }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

const ICONS: Record<ViewerKind, LucideIcon> = {
  markdown: FileText,
  image: ImageIcon,
  svg: ImageIcon,
  mermaid: Workflow,
  table: Table,
  pdf: FileText,
  runnable: FileCode,
  text: File,
};

export function ArtifactsScreen({ navigation, route }: ScreenProps<'Artifacts'>) {
  const { sessionId, path, title } = route.params;
  const atRoot = path === '';
  const { unread, revision } = useArtifacts();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: () => <HeaderTitle title={atRoot ? 'Artifacts' : title} subtitle={atRoot ? title : undefined} mono={!atRoot} /> });
  }, [navigation, title, atRoot]);

  const load = useCallback(async () => {
    try {
      const entries = await listFiles({ sessionId, path, root: 'artifacts' });
      const pad: Row[] = atRoot ? [{ pad: true, entry: entries.find((entry) => entry.name === PAD_FILE && entry.kind === 'file') }] : [];
      setState({ kind: 'ready', rows: [...pad, ...sortArtifacts(entries, atRoot).map((entry) => ({ pad: false as const, entry }))] });
    } catch (err: any) {
      setState(err?.code === METHOD_NOT_FOUND ? { kind: 'unsupported' } : { kind: 'error', message: err?.message || "Couldn't list artifacts" });
    }
  }, [sessionId, path, atRoot]);

  useEffect(() => void load(), [load, revision]);

  if (state.kind === 'loading') return <Loading />;
  if (state.kind === 'unsupported') {
    return <Empty title="Artifacts aren't available" body="This desktop can't share artifacts yet. Update Ostia on the desktop." />;
  }
  if (state.kind === 'error') {
    return <Empty title="Couldn't list artifacts" body={state.message} action={<Button label="Try again" variant="tonal" onPress={() => void load()} />} />;
  }

  const join = (name: string) => (path ? `${path}/${name}` : name);
  const now = Date.now();

  return (
    <FlatList
      data={state.rows}
      keyExtractor={(row) => (row.pad ? ':pad' : row.entry.name)}
      ItemSeparatorComponent={() => <Divider inset={TILE_INSET} />}
      contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          colors={[colors.brand]}
          progressBackgroundColor={colors.surface}
          tintColor={colors.brand}
        />
      }
      ListFooterComponent={
        atRoot && state.rows.length === 1 ? (
          <Text style={[type.caption, styles.hint]}>Nothing else yet. What the agents in this workspace write for you shows up here.</Text>
        ) : null
      }
      renderItem={({ item: row, index }) => {
        const name = row.pad ? PAD_FILE : row.entry.name;
        const kind = row.entry?.kind ?? 'file';
        const dot = isArtifactUnread(unread[sessionId], join(name), kind) ? <View accessibilityLabel="Unread" style={styles.dot} /> : null;
        return (
          <GroupItem first={index === 0} last={index === state.rows.length - 1}>
            {row.pad ? (
              <ListRow
                leading={<IconTile icon={NotebookPen} tone="brand" />}
                title={PAD_TITLE}
                subtitle={row.entry ? `Updated ${formatAge(row.entry.mtime, now)}` : 'Empty'}
                trailing={dot}
                onPress={() => navigation.navigate('FileView', { sessionId, path: PAD_FILE, name: PAD_FILE, root: 'artifacts' })}
              />
            ) : (
              <ListRow
                leading={<IconTile icon={kind === 'dir' ? Folder : ICONS[viewerKind(name)]} />}
                title={name}
                subtitle={kind === 'dir' ? formatAge(row.entry.mtime, now) : `${formatSize(row.entry.size)} · ${formatAge(row.entry.mtime, now)}`}
                mono
                trailing={dot}
                onPress={() =>
                  kind === 'dir'
                    ? navigation.push('Artifacts', { sessionId, path: join(name), title: name })
                    : navigation.navigate('FileView', { sessionId, path: join(name), name, root: 'artifacts' })
                }
              />
            )}
          </GroupItem>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  hint: { paddingHorizontal: space.gutter + space.lg, paddingTop: space.md },
});

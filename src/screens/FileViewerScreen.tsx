import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { ExternalLink, MonitorCheck, MonitorUp, NotebookPen } from 'lucide-react-native';
import { Button, Empty, HeaderTitle, IconButton, Loading } from '../components/ui';
import { MarkdownView } from '../components/viewers/MarkdownView';
import { PictureView } from '../components/viewers/PictureView';
import { SourceView } from '../components/viewers/SourceView';
import { TableView } from '../components/viewers/TableView';
import { PAD_EMPTY, PAD_FILE, PAD_TITLE } from '../model/artifacts';
import { FileTarget, ViewerKind, WHOLE_BYTES_LIMIT, WHOLE_TEXT_LIMIT, decodeUtf8, formatSize, mimeType, readWhole, utf8Bytes, viewerKind } from '../model/files';
import { ScreenProps } from '../navigation';
import { markRead, useArtifacts } from '../services/artifactStore';
import { METHOD_NOT_FOUND, NEEDS_ELEVATION, openOnDesktop, readPiece } from '../services/files';
import { openExternally } from '../services/openExternally';
import { useCaps } from '../services/workspaceStore';
import { colors, space, type } from '../theme';

const LEGACY_READ = 256 * 1024;

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unsupported' }
  | { kind: 'missing' }
  | { kind: 'external'; reason: string }
  | { kind: 'whole'; view: Exclude<ViewerKind, 'pdf' | 'runnable' | 'text'>; data: string }
  | { kind: 'source'; text: string; carry: string; size: number; truncated: boolean; next: number | null };

async function load(target: FileTarget, view: ViewerKind): Promise<State> {
  const read = (offset: number) => readPiece(target, offset);
  if (view === 'pdf') return { kind: 'external', reason: 'PDFs open in another app.' };
  if (view === 'image') {
    const file = await readWhole(read, 'bytes', WHOLE_BYTES_LIMIT);
    if (!file.complete) return { kind: 'external', reason: `${formatSize(file.size)} is too large to show here.` };
    return { kind: 'whole', view, data: file.base64 ?? '' };
  }
  if (view !== 'text' && view !== 'runnable') {
    const file = await readWhole(read, 'text', WHOLE_TEXT_LIMIT);
    if (file.complete && file.text !== undefined) return { kind: 'whole', view, data: file.text };
  }
  const piece = await read(0);
  if (piece.text === undefined) return { kind: 'external', reason: `Can't preview this file (${formatSize(piece.size)}).` };
  return { kind: 'source', text: piece.text, carry: '', size: piece.size, truncated: piece.truncated, next: piece.truncated ? utf8Bytes(piece.text).length : null };
}

export function FileViewerScreen({ navigation, route }: ScreenProps<'FileView'>) {
  const { sessionId, path, name, root = 'workspace' } = route.params;
  const target = useMemo<FileTarget>(() => ({ sessionId, path, root }), [sessionId, path, root]);
  const artifact = root === 'artifacts';
  const pad = artifact && path === PAD_FILE;
  const view = viewerKind(name);
  const { last, revision } = useArtifacts();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [onDesktop, setOnDesktop] = useState(false);
  const caps = useCaps();
  const canOpen = artifact && caps.includes('command') && state.kind !== 'loading' && state.kind !== 'unsupported' && state.kind !== 'missing';
  const loads = useRef(0);
  const seen = useRef(revision);

  const showOnDesktop = useCallback(async () => {
    try {
      await openOnDesktop(target);
      setOnDesktop(true);
    } catch (err: any) {
      Alert.alert(
        "Couldn't open it on the desktop",
        err?.code === NEEDS_ELEVATION ? 'Turn on Run Ostia commands for this phone in Settings › Remote on your desktop.' : err?.message || 'Try again.',
      );
    }
  }, [target]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={pad ? PAD_TITLE : name} subtitle={pad ? 'Read-only on the phone' : path} mono={!pad} />,
      headerRight: canOpen
        ? () => <IconButton icon={onDesktop ? MonitorCheck : MonitorUp} label={onDesktop ? 'Opened on the desktop' : 'Open on desktop'} onPress={() => void showOnDesktop()} />
        : undefined,
    });
  }, [navigation, name, path, pad, canOpen, onDesktop, showOnDesktop]);

  useEffect(() => {
    if (revision === seen.current) return;
    seen.current = revision;
    if (artifact && last?.sessionId === sessionId && last.path === path) setReloads((count) => count + 1);
  }, [artifact, last, revision, sessionId, path]);

  useEffect(() => {
    const current = ++loads.current;
    load(target, view)
      .catch((err: any): State => {
        if (err?.code === METHOD_NOT_FOUND) return { kind: 'unsupported' };
        if (err?.message === 'not-found') return { kind: 'missing' };
        return { kind: 'error', message: err?.message || "Couldn't open this file" };
      })
      .then((next) => {
        if (current !== loads.current) return;
        setState(next);
        if (artifact) markRead(sessionId, path);
      });
  }, [target, view, artifact, sessionId, path, reloads]);

  const loadMore = useCallback(async () => {
    if (state.kind !== 'source' || state.next === null || loadingMore) return;
    const current = loads.current;
    setLoadingMore(true);
    try {
      const piece = await readPiece(target, state.next);
      if (current !== loads.current) return;
      const bytes = piece.base64 === undefined ? '' : atob(piece.base64);
      const decoded = decodeUtf8(state.carry + bytes);
      if (!decoded || bytes.length === 0 || piece.size !== state.size) setState({ ...state, next: null });
      else {
        setState({ ...state, text: state.text + decoded.text, carry: decoded.rest, truncated: piece.truncated, next: piece.truncated ? state.next + bytes.length : null });
      }
    } catch {
      if (current === loads.current) setState({ ...state, next: null });
    } finally {
      setLoadingMore(false);
    }
  }, [state, loadingMore, target]);

  const openElsewhere = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await openExternally(target, name);
    } catch (err: any) {
      setNotice(err?.message || "That didn't work");
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'loading') return <Loading />;
  if (state.kind === 'unsupported') {
    return <Empty title="Artifacts aren't available" body="This desktop can't share artifacts yet. Update Ostia on the desktop." />;
  }
  if (state.kind === 'missing' && pad) return <Empty icon={NotebookPen} title="Nothing on the pad yet" body={PAD_EMPTY} />;
  if (state.kind === 'missing') return <Empty title="Couldn't open this file" body="It isn't there any more." />;
  if (state.kind === 'error') return <Empty title="Couldn't open this file" body={state.message} />;
  if (state.kind === 'external') {
    return (
      <Empty
        title={name}
        body={notice ?? state.reason}
        action={<Button label="Open in another app" icon={ExternalLink} variant="tonal" loading={busy} onPress={() => void openElsewhere()} />}
      />
    );
  }

  if (state.kind === 'whole') {
    if (state.view === 'image') {
      return (
        <View style={styles.fill}>
          <Image accessibilityLabel={name} source={{ uri: `data:${mimeType(name)};base64,${state.data}` }} style={styles.image} resizeMode="contain" />
        </View>
      );
    }
    if (state.view === 'markdown') return <MarkdownView text={state.data} />;
    if (state.view === 'table') return <TableView name={name} text={state.data} />;
    return <PictureView kind={state.view} source={state.data} />;
  }

  const shown = state.next ?? LEGACY_READ;
  return (
    <SourceView
      text={state.text}
      loadingMore={loadingMore}
      onEndReached={() => void loadMore()}
      note={state.truncated ? `Showing the first ${formatSize(shown)} of ${formatSize(state.size)}.` : null}
      header={
        view === 'runnable' ? (
          <View style={styles.banner}>
            <Text style={type.bodyMuted}>{onDesktop ? 'Opened on the desktop.' : 'This runs on the desktop only. The phone shows its source.'}</Text>
            {canOpen ? <Button label="Open on desktop" icon={MonitorUp} variant="tonal" compact onPress={() => void showOnDesktop()} style={styles.bannerAction} /> : null}
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bgSunken },
  image: { flex: 1, margin: 16 },
  banner: { paddingHorizontal: space.gutter, paddingBottom: space.md },
  bannerAction: { alignSelf: 'flex-start', marginTop: space.sm },
});

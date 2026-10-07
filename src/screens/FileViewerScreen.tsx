import React, { useEffect, useLayoutEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { Empty, HeaderTitle, Loading } from '../components/ui';
import { FileContent, formatSize, numberedLines, previewKind } from '../model/files';
import { ScreenProps } from '../navigation';
import { OstiaRpc } from '../services/rpc';
import { colors, font, space, type } from '../theme';

export function FileViewerScreen({ navigation, route }: ScreenProps<'FileView'>) {
  const { sessionId, path, name } = route.params;
  const [content, setContent] = useState<FileContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: () => <HeaderTitle title={name} subtitle={path} mono /> });
  }, [navigation, name, path]);

  useEffect(() => {
    OstiaRpc.call('fs.read', { sessionId, path })
      .then(setContent)
      .catch((err: any) => setError(err?.message || "Couldn't open this file"));
  }, [sessionId, path]);

  if (error) return <Empty title="Couldn't open this file" body={error} />;
  if (!content) return <Loading />;

  const kind = previewKind(name, content);
  const footer = content.truncated ? (
    <Text style={[type.caption, styles.footer]}>Showing the first {formatSize(256 * 1024)} of {formatSize(content.size)}.</Text>
  ) : null;

  if (kind === 'image') {
    return (
      <View style={styles.fill}>
        <Image source={{ uri: `data:image/*;base64,${content.base64}` }} style={styles.image} resizeMode="contain" />
      </View>
    );
  }
  if (kind === 'none') return <Empty title="Can't preview this file" body={formatSize(content.size)} />;

  return (
    <FlatList
      data={numberedLines(content.text ?? '')}
      keyExtractor={(line) => String(line.number)}
      contentContainerStyle={styles.code}
      initialNumToRender={60}
      renderItem={({ item: line }) => (
        <View style={styles.line}>
          <Text style={styles.number}>{line.number}</Text>
          <Text style={styles.text}>{line.text}</Text>
        </View>
      )}
      ListFooterComponent={footer}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bgSunken },
  image: { flex: 1, margin: 16 },
  code: { paddingVertical: 12, backgroundColor: colors.bgSunken, flexGrow: 1 },
  line: { flexDirection: 'row', paddingHorizontal: space.gutter },
  number: { fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: colors.dim, minWidth: 24, textAlign: 'right', marginRight: space.md },
  text: { fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: colors.fg, flex: 1 },
  footer: { padding: space.gutter },
});

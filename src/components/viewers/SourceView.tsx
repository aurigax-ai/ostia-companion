import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { numberedLines } from '../../model/files';
import { colors, font, space, type } from '../../theme';

export function SourceView({
  text,
  header,
  note,
  loadingMore,
  onEndReached,
}: {
  text: string;
  header?: React.ReactElement | null;
  note?: string | null;
  loadingMore?: boolean;
  onEndReached?: () => void;
}) {
  return (
    <FlatList
      testID="source"
      data={numberedLines(text)}
      keyExtractor={(line) => String(line.number)}
      contentContainerStyle={styles.code}
      initialNumToRender={60}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={header}
      renderItem={({ item: line }) => (
        <View style={styles.line}>
          <Text style={styles.number}>{line.number}</Text>
          <Text style={styles.text}>{line.text}</Text>
        </View>
      )}
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={colors.brand} style={styles.footer} /> : note ? <Text style={[type.caption, styles.footer]}>{note}</Text> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  code: { paddingVertical: 12, backgroundColor: colors.bgSunken, flexGrow: 1 },
  line: { flexDirection: 'row', paddingHorizontal: space.gutter },
  number: { fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: colors.dim, minWidth: 24, textAlign: 'right', marginRight: space.md },
  text: { fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: colors.fg, flex: 1 },
  footer: { padding: space.gutter },
});

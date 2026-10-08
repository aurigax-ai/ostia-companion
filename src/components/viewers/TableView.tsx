import React, { useMemo } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TABLE_ROW_LIMIT, parseTable } from '../../model/table';
import { colors, font, space, type } from '../../theme';

export function TableView({ name, text }: { name: string; text: string }) {
  const table = useMemo(() => parseTable(name, text), [name, text]);
  const row = (cells: string[], header: boolean) => (
    <View style={[styles.row, header && styles.header]}>
      {cells.map((cell, column) => (
        <Text key={column} style={[header ? styles.headerCell : styles.cell, { width: table.widths[column] }]} numberOfLines={header ? 1 : 3}>
          {cell}
        </Text>
      ))}
    </View>
  );
  return (
    <ScrollView horizontal style={styles.fill} contentContainerStyle={styles.content}>
      <FlatList
        data={table.rows}
        keyExtractor={(_, index) => String(index)}
        ListHeaderComponent={row(table.header, true)}
        stickyHeaderIndices={[0]}
        initialNumToRender={40}
        renderItem={({ item }) => row(item, false)}
        ListFooterComponent={
          table.total > TABLE_ROW_LIMIT ? (
            <Text style={[type.caption, styles.footer]}>
              Showing the first {TABLE_ROW_LIMIT.toLocaleString('en-US')} of {table.total.toLocaleString('en-US')} rows.
            </Text>
          ) : null
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bgSunken },
  content: { flexGrow: 1 },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  header: { backgroundColor: colors.surface, borderBottomColor: colors.lineStrong },
  cell: { fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: colors.fg, paddingHorizontal: space.md, paddingVertical: space.sm },
  headerCell: { fontFamily: font.monoSemibold, fontSize: 12, lineHeight: 18, color: colors.muted, paddingHorizontal: space.md, paddingVertical: space.sm },
  footer: { padding: space.gutter },
});

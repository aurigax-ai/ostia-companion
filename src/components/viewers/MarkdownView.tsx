import React, { useMemo, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Token, type Tokens, marked } from 'marked';
import { Button } from '../ui';
import { colors, font, radius, space, type } from '../../theme';
import { PictureView } from './PictureView';

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;
const LINK = /^(https?:|mailto:)/i;
const DIAGRAMS_DRAWN = 3;

export function MarkdownView({ text }: { text: string }) {
  const tokens = useMemo(() => marked.lexer(text), [text]);
  let diagrams = 0;
  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
      <Blocks tokens={tokens} diagram={() => diagrams++ < DIAGRAMS_DRAWN} />
    </ScrollView>
  );
}

function Blocks({ tokens, diagram }: { tokens: Token[]; diagram: () => boolean }) {
  return (
    <>
      {tokens.map((token, index) => (
        <Block key={index} token={token} diagram={diagram} />
      ))}
    </>
  );
}

function Block({ token, diagram }: { token: Token; diagram: () => boolean }) {
  switch (token.type) {
    case 'heading':
      return (
        <Text accessibilityRole="header" style={[styles.heading, HEADING[Math.min(token.depth, 4) - 1]]}>
          <Inline tokens={token.tokens} />
        </Text>
      );
    case 'paragraph':
    case 'text':
      return (
        <Text style={styles.paragraph}>
          <Inline tokens={(token as Tokens.Paragraph).tokens ?? [token]} />
        </Text>
      );
    case 'code':
      return token.lang === 'mermaid' ? <Diagram source={token.text} drawn={diagram()} /> : <Text style={styles.code}>{token.text}</Text>;
    case 'blockquote':
      return (
        <View style={styles.quote}>
          <Blocks tokens={token.tokens ?? []} diagram={diagram} />
        </View>
      );
    case 'list':
      return (
        <View style={styles.list}>
          {(token as Tokens.List).items.map((item, index) => (
            <View key={index} style={styles.item}>
              <Text style={styles.bullet}>{item.task ? (item.checked ? '☑' : '☐') : token.ordered ? `${Number(token.start || 1) + index}.` : '•'}</Text>
              <View style={styles.itemBody}>
                <Blocks tokens={item.tokens.filter((child) => child.type !== 'checkbox')} diagram={diagram} />
              </View>
            </View>
          ))}
        </View>
      );
    case 'table':
      return (
        <ScrollView horizontal style={styles.table}>
          <View>
            {[(token as Tokens.Table).header, ...(token as Tokens.Table).rows].map((row, index) => (
              <View key={index} style={[styles.tableRow, index === 0 && styles.tableHeader]}>
                {row.map((cell, column) => (
                  <Text key={column} style={[styles.cell, index === 0 && styles.headerCell]}>
                    <Inline tokens={cell.tokens} />
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    case 'hr':
      return <View style={styles.rule} />;
    case 'html':
      return <Text style={styles.code}>{token.text.trimEnd()}</Text>;
    default:
      return null;
  }
}

function Diagram({ source, drawn }: { source: string; drawn: boolean }) {
  const [shown, setShown] = useState(drawn);
  if (shown) return <View style={styles.diagram}><PictureView kind="mermaid" source={source} inline /></View>;
  return (
    <View>
      <Text style={styles.code}>{source}</Text>
      <Button label="Show diagram" variant="tonal" compact onPress={() => setShown(true)} style={styles.show} />
    </View>
  );
}

function Inline({ tokens }: { tokens: Token[] | undefined }) {
  return (
    <>
      {(tokens ?? []).map((token, index) => {
        switch (token.type) {
          case 'strong':
            return <Text key={index} style={styles.strong}><Inline tokens={token.tokens} /></Text>;
          case 'em':
            return <Text key={index} style={styles.em}><Inline tokens={token.tokens} /></Text>;
          case 'del':
            return <Text key={index} style={styles.del}><Inline tokens={token.tokens} /></Text>;
          case 'codespan':
            return <Text key={index} style={styles.codespan}>{token.text}</Text>;
          case 'br':
            return <Text key={index}>{'\n'}</Text>;
          case 'link':
            return LINK.test(token.href) ? (
              <Text key={index} accessibilityRole="link" style={styles.link} onPress={() => void Linking.openURL(token.href)}>
                <Inline tokens={token.tokens} />
              </Text>
            ) : (
              <Text key={index}><Inline tokens={token.tokens} /></Text>
            );
          case 'image':
            return DATA_IMAGE.test(token.href) ? (
              <Image key={index} accessibilityLabel={token.text} source={{ uri: token.href }} style={styles.image} resizeMode="contain" />
            ) : (
              <Text key={index} style={styles.blocked}>[image not loaded: {token.text || token.href}]</Text>
            );
          case 'text':
            return (token as Tokens.Text).tokens ? <Inline key={index} tokens={(token as Tokens.Text).tokens} /> : <Text key={index}>{token.text}</Text>;
          default:
            return <Text key={index}>{'text' in token ? token.text : token.raw}</Text>;
        }
      })}
    </>
  );
}

const HEADING = [
  { fontSize: 24, lineHeight: 30 },
  { fontSize: 20, lineHeight: 26 },
  { fontSize: 17, lineHeight: 24 },
  { fontSize: 16, lineHeight: 22 },
];

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.gutter, paddingBottom: space.xxl },
  heading: { fontFamily: font.semibold, color: colors.fg, marginTop: space.lg, marginBottom: space.sm },
  paragraph: { ...type.body, marginBottom: space.md },
  strong: { fontFamily: font.semibold },
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through', color: colors.muted },
  codespan: { fontFamily: font.mono, fontSize: 14, backgroundColor: colors.surfaceHigh },
  link: { color: colors.brand, textDecorationLine: 'underline' },
  blocked: { color: colors.dim },
  image: { width: 240, height: 160 },
  code: {
    fontFamily: font.mono,
    fontSize: 12,
    lineHeight: 18,
    color: colors.fg,
    backgroundColor: colors.bgSunken,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.md,
    overflow: 'hidden',
  },
  diagram: { borderRadius: radius.sm, overflow: 'hidden', marginBottom: space.md },
  show: { alignSelf: 'flex-start', marginBottom: space.md },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.lineStrong, paddingLeft: space.md, marginBottom: space.md },
  list: { marginBottom: space.sm },
  item: { flexDirection: 'row' },
  bullet: { ...type.body, color: colors.muted, minWidth: 24 },
  itemBody: { flex: 1 },
  table: { marginBottom: space.md },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tableHeader: { borderBottomColor: colors.lineStrong },
  cell: { ...type.bodyMuted, color: colors.fg, width: 140, paddingVertical: space.sm, paddingRight: space.md },
  headerCell: { fontFamily: font.semibold, color: colors.muted },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong, marginVertical: space.lg },
});

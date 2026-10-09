import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { MERMAID_SOURCE } from '../../generated/mermaidSource';
import { mermaidPage, mermaidRuntime, svgPage } from '../../model/pictureHtml';
import { colors, font, space, type } from '../../theme';

const BLANK = 'about:blank';
const INLINE_START = 160;
const INLINE_MAX = 1200;

let runtime: string | null = null;

export function PictureView({ kind, source, inline }: { kind: 'svg' | 'mermaid'; source: string; inline?: boolean }) {
  const html = useMemo(() => (kind === 'svg' ? svgPage(source) : mermaidPage(source, (runtime ??= mermaidRuntime(MERMAID_SOURCE)))), [kind, source]);
  const [height, setHeight] = useState(INLINE_START);
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <View style={inline ? styles.failedInline : styles.failed}>
        <Text style={[type.caption, styles.error]}>Couldn't draw this diagram: {error}</Text>
        <Text style={styles.source}>{source}</Text>
      </View>
    );
  }

  return (
    <WebView
      accessibilityLabel={kind === 'svg' ? 'Picture' : 'Diagram'}
      source={{ html, baseUrl: BLANK }}
      originWhitelist={[BLANK]}
      onShouldStartLoadWithRequest={(request) => request.url === BLANK}
      javaScriptEnabled={kind === 'mermaid'}
      onMessage={(event) => {
        try {
          const report = JSON.parse(event.nativeEvent.data);
          if (typeof report?.error === 'string') setError(report.error.slice(0, 300));
          else if (Number.isFinite(report?.height)) setHeight(Math.min(INLINE_MAX, Math.max(40, Math.ceil(report.height))));
        } catch {}
      }}
      domStorageEnabled={false}
      cacheEnabled={false}
      incognito
      allowFileAccess={false}
      setSupportMultipleWindows={false}
      mixedContentMode="never"
      scrollEnabled={!inline}
      style={inline ? [styles.inline, { height }] : styles.fill}
      containerStyle={inline ? { flex: 0, height } : undefined}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bgSunken },
  inline: { backgroundColor: colors.bgSunken },
  failed: { flex: 1, padding: space.gutter, backgroundColor: colors.bgSunken },
  failedInline: { padding: space.md, backgroundColor: colors.bgSunken },
  error: { color: colors.brand, marginBottom: space.sm },
  source: { fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: colors.fg },
});

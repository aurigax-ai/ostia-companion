import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Folder } from 'lucide-react-native';
import { Shortcut, shortcutsFor } from '../model/shortcuts';
import { blanks, fillSnippet, Snippet, snippetsFor, unfilled } from '../model/snippets';
import type { Session } from '../model/workspaces';
import { phoneControlSupported } from '../services/phoneSession';
import { useSnippets } from '../services/snippets';
import { colors, font, radius, space, type } from '../theme';
import { MessageField } from './PromptComposer';
import { Group, IconTile, ListRow, NO_SCROLL_BARS, Sheet, Warning } from './ui';

function MenuRow({ name, hint, onPress }: { name: string; hint: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="menuitem" accessibilityLabel={name} onPress={onPress} android_ripple={{ color: colors.ripple }} style={styles.row}>
      <Text style={[type.monoLabel, styles.name]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[type.bodyMuted, styles.hint]} numberOfLines={2}>
        {hint}
      </Text>
    </Pressable>
  );
}

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  placeholder,
  editable,
  sending,
  autoFocus,
  snippetsFrom,
  workspaces,
  bottomInset,
  tools,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  editable: boolean;
  sending?: boolean;
  autoFocus?: boolean;
  snippetsFrom: string | null;
  workspaces: Session[];
  bottomInset: number;
  tools?: React.ReactNode;
}) {
  const [reviewing, setReviewing] = useState<Shortcut | null>(null);
  const [holes, setHoles] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const snippets = useSnippets(snippetsFrom);
  const ostia = shortcutsFor(value, phoneControlSupported());
  const own = snippetsFor(value, snippets);

  const pick = (shortcut: Shortcut) => (shortcut.needsWorkspace ? setReviewing(shortcut) : onChangeText(shortcut.fill()));
  const pickSnippet = (snippet: Snippet) => {
    setHoles(blanks(snippet));
    setBlocked([]);
    onChangeText(fillSnippet(snippet));
  };
  const edit = (next: string) => {
    setBlocked(unfilled(next, blocked));
    onChangeText(next);
  };
  const send = () => {
    const left = unfilled(value, holes);
    setBlocked(left);
    if (left.length > 0) return;
    setHoles([]);
    onSend();
  };

  return (
    <>
      {ostia.length + own.length > 0 ? (
        <View style={styles.menu} accessibilityRole="menu">
          <ScrollView {...NO_SCROLL_BARS} keyboardShouldPersistTaps="handled" style={styles.menuList}>
            {ostia.map((shortcut) => (
              <MenuRow key={shortcut.name} name={shortcut.name} hint={shortcut.hint} onPress={() => pick(shortcut)} />
            ))}
            {own.length > 0 ? <Text style={[type.caption, styles.section]}>From your snippets</Text> : null}
            {own.map((snippet) => (
              <MenuRow key={`snippet:${snippet.name}`} name={`/${snippet.name}`} hint={snippet.description ?? snippet.command} onPress={() => pickSnippet(snippet)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {blocked.length > 0 ? <Warning text={`Fill in ${blocked.join(', ')} first.`} /> : null}
      <View style={[styles.bar, { paddingBottom: space.sm + bottomInset }]}>
        {tools}
        <MessageField value={value} onChangeText={edit} onSend={send} placeholder={placeholder} editable={editable} sending={sending} autoFocus={autoFocus} />
      </View>
      <Sheet visible={reviewing !== null} onClose={() => setReviewing(null)}>
        <Text style={[type.captionStrong, styles.sheetTitle]}>Review which workspace?</Text>
        <ScrollView {...NO_SCROLL_BARS} style={styles.sheetList}>
          <Group>
            {workspaces.map((session) => (
              <ListRow
                key={session.sessionId}
                leading={<IconTile icon={Folder} />}
                title={session.name}
                chevron={false}
                onPress={() => {
                  if (reviewing) onChangeText(reviewing.fill(session.name));
                  setReviewing(null);
                }}
              />
            ))}
          </Group>
        </ScrollView>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    marginHorizontal: space.gutter,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  menuList: { maxHeight: 320, paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.md },
  name: { width: 112, fontFamily: font.mono },
  hint: { flex: 1 },
  section: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  bar: { paddingHorizontal: space.gutter, paddingTop: space.sm, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  sheetTitle: { paddingHorizontal: space.xs, paddingBottom: space.md },
  sheetList: { maxHeight: 420 },
});

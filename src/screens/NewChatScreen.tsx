import React, { useLayoutEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Bot, ChevronDown, Folder } from 'lucide-react-native';
import { MessageField } from '../components/PromptComposer';
import { Group, IconTile, ListRow, Sheet, Warning, NO_SCROLL_BARS } from '../components/ui';
import { AGENTS, AgentName, chatTarget } from '../model/agentStart';
import { Shortcut, shortcutsFor } from '../model/shortcuts';
import { ScreenProps } from '../navigation';
import { startAgent } from '../services/agentStart';
import { rememberChatWorkspace, useListPrefs } from '../services/listPrefsStore';
import { phoneControlSupported } from '../services/phoneSession';
import { useCaps, useWorkspaces } from '../services/workspaceStore';
import { colors, font, radius, space, type } from '../theme';

type Picking = null | 'agent' | 'workspace' | Shortcut;

export function NewChatScreen({ navigation, route }: ScreenProps<'NewChat'>) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const canRespond = useCaps().includes('respond');
  const { sessions } = useWorkspaces();
  const { lastChat } = useListPrefs();
  const [chosen, setChosen] = useState<string | undefined>(route.params?.sessionId);
  const target = chatTarget(sessions, chosen, lastChat);
  const [agent, setAgent] = useState<AgentName>('claude');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState<Picking>(null);
  const name = target?.name ?? 'No workspace';
  const shortcuts = shortcutsFor(text, phoneControlSupported());
  const workspaces = sessions.filter((session) => session.kind !== 'scratch' && session.kind !== 'manager');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.to}>
          <Pressable accessibilityRole="button" accessibilityLabel={`To ${agent}. Choose the agent`} disabled={sending} onPress={() => setPicking('agent')} style={styles.toRow}>
            <Text style={type.headline}>{agent}</Text>
            <ChevronDown size={16} color={colors.muted} strokeWidth={2.25} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`In ${name}. Choose the workspace`} disabled={sending} onPress={() => setPicking('workspace')} style={styles.toRow}>
            <Text style={type.mono} numberOfLines={1}>
              {name}
            </Text>
            <ChevronDown size={12} color={colors.dim} strokeWidth={2.25} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, agent, name, sending]);

  const edit = (next: string) => {
    setText(next);
    setProblem(null);
  };

  const pick = (shortcut: Shortcut) => {
    if (shortcut.needsWorkspace) return setPicking(shortcut);
    edit(shortcut.fill());
  };

  const choose = (sessionId: string, workspace: string) => {
    if (picking === 'workspace') setChosen(sessionId);
    else if (picking && picking !== 'agent') edit(picking.fill(workspace));
    setPicking(null);
  };

  const send = async () => {
    const prompt = text.trim();
    if (!prompt || !target) return;
    setProblem(null);
    setSending(true);
    const started = await startAgent(target.sessionId, agent, prompt);
    setSending(false);
    if (!started.ok) return setProblem(started.text);
    rememberChatWorkspace(target.sessionId);
    navigation.replace('Terminal', { paneId: started.paneId, title: agent });
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <View style={styles.thread}>
        <Text style={[type.headline, styles.center]}>What can I do for you?</Text>
        <Text style={[type.bodyMuted, styles.center, styles.hint]}>{sending ? `Starting ${agent}…` : 'Ask anything, or type / for shortcuts'}</Text>
        {problem ? (
          <View style={styles.warning}>
            <Warning text={problem} />
          </View>
        ) : null}
      </View>
      {shortcuts.length > 0 ? (
        <View style={styles.shortcuts} accessibilityRole="menu">
          {shortcuts.map((shortcut) => (
            <Pressable
              key={shortcut.name}
              accessibilityRole="menuitem"
              accessibilityLabel={shortcut.name}
              onPress={() => pick(shortcut)}
              android_ripple={{ color: colors.ripple }}
              style={styles.shortcut}
            >
              <Text style={[type.monoLabel, styles.shortcutName]}>{shortcut.name}</Text>
              <Text style={[type.bodyMuted, styles.shortcutHint]} numberOfLines={2}>
                {shortcut.hint}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={[styles.bar, { paddingBottom: space.sm + insets.bottom }]}>
        <MessageField
          value={text}
          onChangeText={edit}
          onSend={() => void send()}
          placeholder={canRespond ? 'Message' : 'Turn on Respond in Settings › Remote'}
          editable={canRespond && !!target}
          sending={sending}
          autoFocus
        />
      </View>
      <Sheet visible={picking === 'agent'} onClose={() => setPicking(null)}>
        <Text style={[type.captionStrong, styles.sheetTitle]}>Chat with</Text>
        <Group>
          {AGENTS.map((choice) => (
            <ListRow
              key={choice}
              leading={<IconTile icon={Bot} tone={choice === agent ? 'brand' : 'neutral'} />}
              title={choice}
              chevron={false}
              onPress={() => (setAgent(choice), setPicking(null))}
            />
          ))}
        </Group>
      </Sheet>
      <Sheet visible={picking !== null && picking !== 'agent'} onClose={() => setPicking(null)}>
        <Text style={[type.captionStrong, styles.sheetTitle]}>{picking === 'workspace' ? 'Start the chat in' : 'Review which workspace?'}</Text>
        <ScrollView {...NO_SCROLL_BARS} style={styles.sheetList}>
          <Group>
            {workspaces.map((session) => (
              <ListRow
                key={session.sessionId}
                leading={<IconTile icon={Folder} tone={session.sessionId === target?.sessionId && picking === 'workspace' ? 'brand' : 'neutral'} />}
                title={session.name}
                chevron={false}
                onPress={() => choose(session.sessionId, session.name)}
              />
            ))}
          </Group>
        </ScrollView>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  thread: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.gutter, paddingBottom: space.xl },
  center: { textAlign: 'center' },
  hint: { marginTop: space.xs },
  warning: { marginTop: space.lg },
  bar: { paddingHorizontal: space.gutter, paddingTop: space.sm, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  to: { flexShrink: 1 },
  toRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  shortcuts: {
    marginHorizontal: space.gutter,
    marginBottom: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  shortcut: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.md },
  shortcutName: { width: 96, fontFamily: font.mono },
  shortcutHint: { flex: 1 },
  sheetTitle: { paddingHorizontal: space.xs, paddingBottom: space.md },
  sheetList: { maxHeight: 420 },
});

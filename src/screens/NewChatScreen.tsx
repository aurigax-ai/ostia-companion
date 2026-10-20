import React, { useLayoutEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Bot, ChevronDown, Folder, Smartphone } from 'lucide-react-native';
import { ChatComposer } from '../components/ChatComposer';
import { Group, IconTile, ListRow, NO_SCROLL_BARS, Sheet, Warning } from '../components/ui';
import { AGENTS, AgentName, ChatChoice, chatTarget } from '../model/agentStart';
import { ScreenProps } from '../navigation';
import { startAgent } from '../services/agentStart';
import { rememberChatWorkspace, useListPrefs } from '../services/listPrefsStore';
import { useCaps, useWorkspaces } from '../services/workspaceStore';
import { usePhoneWorkspace } from '../services/phoneWorkspace';
import { colors, space, type } from '../theme';

type Picking = null | 'agent' | 'workspace';

export function NewChatScreen({ navigation, route }: ScreenProps<'NewChat'>) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const canRespond = useCaps().includes('respond');
  const { sessions } = useWorkspaces();
  const phone = usePhoneWorkspace();
  const { lastChat } = useListPrefs();
  const [chosen, setChosen] = useState<ChatChoice | undefined>(route.params?.sessionId ? { kind: 'workspace', sessionId: route.params.sessionId } : undefined);
  const target = chatTarget(sessions, chosen, lastChat, phone);
  const [picked, setPicked] = useState<AgentName | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState<Picking>(null);
  const onPhone = target?.kind === 'phone';
  const agent = picked ?? (onPhone ? (phone?.agent ?? 'claude') : 'claude');
  const phoneSession = sessions.find((session) => session.phone) ?? null;
  const workspace = target?.kind === 'workspace' ? target.session : null;
  const title = onPhone ? 'Phone agent' : agent;
  const subtitle = onPhone ? `${agent} · Phone` : (workspace?.name ?? 'No workspace');
  const workspaces = sessions.filter((session) => session.kind !== 'scratch' && session.kind !== 'manager' && !(phone?.set && session.phone));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.to}>
          <Pressable accessibilityRole="button" accessibilityLabel={`To ${title}. Choose the agent`} disabled={sending} onPress={() => setPicking('agent')} style={styles.toRow}>
            <Text style={type.headline}>{title}</Text>
            <ChevronDown size={16} color={colors.muted} strokeWidth={2.25} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`In ${subtitle}. Choose the workspace`} disabled={sending} onPress={() => setPicking('workspace')} style={styles.toRow}>
            <Text style={type.mono} numberOfLines={1}>
              {subtitle}
            </Text>
            <ChevronDown size={12} color={colors.dim} strokeWidth={2.25} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, title, subtitle, sending]);

  const edit = (next: string) => {
    setText(next);
    setProblem(null);
  };

  const send = async () => {
    const prompt = text.trim();
    if (!prompt || !target) return;
    setProblem(null);
    setSending(true);
    const started = await startAgent(workspace?.sessionId ?? null, onPhone ? picked : agent, prompt);
    setSending(false);
    if (!started.ok) return setProblem(started.text);
    if (workspace) rememberChatWorkspace(workspace.sessionId);
    navigation.replace('Conversation', { paneId: started.paneId, title: agent });
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
      <ChatComposer
        value={text}
        onChangeText={edit}
        onSend={() => void send()}
        placeholder={canRespond ? 'Message' : 'Turn on Respond in Settings › Remote'}
        editable={canRespond && !!target}
        sending={sending}
        autoFocus
        snippetsFrom={workspace?.sessionId ?? phoneSession?.sessionId ?? null}
        workspaces={workspaces}
        bottomInset={insets.bottom}
      />
      <Sheet visible={picking === 'agent'} onClose={() => setPicking(null)}>
        <Text style={[type.captionStrong, styles.sheetTitle]}>Chat with</Text>
        <Group>
          {AGENTS.map((choice) => (
            <ListRow
              key={choice}
              leading={<IconTile icon={Bot} tone={choice === agent ? 'brand' : 'neutral'} />}
              title={choice}
              chevron={false}
              onPress={() => (setPicked(choice), setPicking(null))}
            />
          ))}
        </Group>
      </Sheet>
      <Sheet visible={picking === 'workspace'} onClose={() => setPicking(null)}>
        <Text style={[type.captionStrong, styles.sheetTitle]}>Start the chat in</Text>
        <ScrollView {...NO_SCROLL_BARS} nestedScrollEnabled style={styles.sheetList}>
          <Group>
            {phone?.set ? (
              <ListRow
                leading={<IconTile icon={Smartphone} tone={onPhone ? 'brand' : 'neutral'} />}
                title="Phone"
                subtitle="Your Phone workspace on the desktop"
                chevron={false}
                onPress={() => (setChosen({ kind: 'phone' }), setPicking(null))}
              />
            ) : null}
            {workspaces.map((session) => (
              <ListRow
                key={session.sessionId}
                leading={<IconTile icon={Folder} tone={session.sessionId === workspace?.sessionId ? 'brand' : 'neutral'} />}
                title={session.name}
                chevron={false}
                onPress={() => (setChosen({ kind: 'workspace', sessionId: session.sessionId }), setPicking(null))}
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
  to: { flexShrink: 1 },
  toRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 24 },
  sheetTitle: { paddingHorizontal: space.xs, paddingBottom: space.md },
  sheetList: { maxHeight: 420 },
});

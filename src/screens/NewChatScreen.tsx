import React, { useLayoutEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { ChevronDown } from 'lucide-react-native';
import { MessageField } from '../components/PromptComposer';
import { Warning } from '../components/ui';
import { AGENTS, AgentName } from '../model/agentStart';
import { ScreenProps } from '../navigation';
import { startAgent } from '../services/agentStart';
import { useCaps } from '../services/workspaceStore';
import { colors, radius, space, type } from '../theme';

export function NewChatScreen({ navigation, route }: ScreenProps<'NewChat'>) {
  const { sessionId, name } = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const canRespond = useCaps().includes('respond');
  const [agent, setAgent] = useState<AgentName>('claude');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const other = AGENTS.find((candidate) => candidate !== agent) ?? agent;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`To ${agent} in ${name}. Switch to ${other}`}
          disabled={sending}
          onPress={() => setAgent(other)}
          style={styles.to}
        >
          <View style={styles.toRow}>
            <Text style={type.headline}>{agent}</Text>
            <ChevronDown size={16} color={colors.muted} strokeWidth={2.25} />
          </View>
          <Text style={type.mono} numberOfLines={1}>
            {name}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, agent, other, name, sending]);

  const send = async () => {
    const prompt = text.trim();
    if (!prompt) return;
    setProblem(null);
    setSending(true);
    const started = await startAgent(sessionId, agent, prompt);
    setSending(false);
    if (started.ok) navigation.replace('Terminal', { paneId: started.paneId, title: agent });
    else setProblem(started.text);
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <View style={styles.thread}>
        <Text style={[type.headline, styles.center]}>What can I do for you?</Text>
        <Text style={[type.bodyMuted, styles.center, styles.hint]}>
          {sending ? `Starting ${agent}…` : `Your message starts ${agent} in a new tab of ${name}.`}
        </Text>
        {problem ? (
          <View style={styles.warning}>
            <Warning text={problem} />
          </View>
        ) : null}
      </View>
      <View style={[styles.bar, { paddingBottom: space.sm + insets.bottom }]}>
        <MessageField
          value={text}
          onChangeText={(next) => (setText(next), setProblem(null))}
          onSend={() => void send()}
          placeholder={canRespond ? 'Message' : 'Turn on Respond in Settings › Remote'}
          editable={canRespond}
          sending={sending}
          autoFocus
        />
      </View>
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
});

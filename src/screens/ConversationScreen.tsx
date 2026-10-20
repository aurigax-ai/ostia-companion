import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Bot, Square } from 'lucide-react-native';
import { ChatSwitch } from '../components/ChatSwitch';
import { TurnView } from '../components/ChatBlocks';
import { ChatComposer } from '../components/ChatComposer';
import { ComposerTools } from '../components/ComposerTools';
import { AskSheet } from '../components/AskSheet';
import { Button, Empty, HeaderTitle, Loading, NO_SCROLL_BARS, Sheet, Warning } from '../components/ui';
import { toolTarget, toolVerb, turnRunning } from '../model/agentStream';
import { ATTACH_FAILED, imageRefusal } from '../model/attachment';
import { paneTitle, shortPath } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { answerAsk, interruptAgent, promptAgent, useAsks } from '../services/askStore';
import { useAgentStream } from '../services/agentStream';
import { useDictation } from '../services/dictation';
import { PickedImage, pickImage } from '../services/images';
import { useCaps, useFeatures, useWorkspaces } from '../services/workspaceStore';
import { colors, font, radius, space, type } from '../theme';

const NEAR_BOTTOM = 80;

type Detail = { title: string; input?: string; output?: string };

export function ConversationScreen({ navigation, route }: ScreenProps<'Conversation'>) {
  const { paneId, title } = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const canRespond = useCaps().includes('respond');
  const images = useFeatures().includes('prompt-image');
  const { sessions, panes } = useWorkspaces();
  const asks = useAsks();
  const { state, status, problem } = useAgentStream(paneId);
  const pane = panes.find((p) => p.paneId === paneId);
  const workspace = sessions.find((s) => s.sessionId === pane?.sessionId);
  const agent = pane?.agent && pane.agent !== 'other' ? pane.agent : title;
  const heading = pane ? paneTitle(pane) : title;
  const [sendProblem, setSendProblem] = useState<string | null>(null);
  const nearBottom = useRef(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attached, setAttached] = useState<PickedImage | null>(null);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const dictation = useDictation(text, setText);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const scroll = useRef<ScrollView>(null);
  const ownAsks = asks.asks.filter((ask) => ask.paneId === paneId);
  const sheetAsk = ownAsks.find((ask) => !dismissed.includes(ask.askId)) ?? null;
  const waitingAsk = ownAsks.find((ask) => dismissed.includes(ask.askId)) ?? null;
  const running = turnRunning(state);

  const openTerminal = useCallback(() => navigation.navigate('Terminal', { paneId, title }), [navigation, paneId, title]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={heading} subtitle={[heading === agent ? null : agent, shortPath(pane?.cwd ?? workspace?.workDir)].filter(Boolean).join(' · ')} />,
      headerRight: () => <ChatSwitch value="chat" onChange={openTerminal} />,
    });
  }, [navigation, heading, agent, pane?.cwd, workspace?.workDir, openTerminal]);

  useEffect(() => {
    if (status === 'terminal') navigation.replace('Terminal', { paneId, title });
  }, [status, navigation, paneId, title]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const attach = async (source: 'gallery' | 'camera') => {
    setPickProblem(null);
    try {
      const result = await pickImage(source);
      if (!result) return;
      if ('problem' in result) setPickProblem(result.problem);
      else setAttached(result.picked);
    } catch {
      setPickProblem(ATTACH_FAILED);
    }
  };

  const edit = (next: string) => {
    dictation.abort();
    setText(next);
  };

  const send = async () => {
    const prompt = text.trim();
    if (!prompt && !attached) return;
    dictation.abort();
    setSending(true);
    setSendProblem(null);
    try {
      await (attached ? promptAgent(paneId, prompt, attached.image) : promptAgent(paneId, prompt));
      setText('');
      setAttached(null);
    } catch (err: any) {
      if (err?.message === 'not-submitted') setAttached(null);
      setSendProblem(
        imageRefusal(err?.message) ??
          (err?.message === 'not-submitted' ? `${agent} did not start a turn. Your message is still in its prompt on the desktop.` : err?.message || 'Could not send.'),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
      {status === 'opening' ? (
        <Loading />
      ) : (
        <ScrollView
          {...NO_SCROLL_BARS}
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => nearBottom.current && scroll.current?.scrollToEnd({ animated: false })}
          onLayout={() => nearBottom.current && scroll.current?.scrollToEnd({ animated: false })}
          onScroll={({ nativeEvent }) => {
            nearBottom.current = nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height >= nativeEvent.contentSize.height - NEAR_BOTTOM;
          }}
          scrollEventThrottle={100}
          keyboardShouldPersistTaps="handled"
        >
          {state.live && state.turns.length === 0 ? <Empty icon={Bot} title="No turns yet" body="The thread starts at the next prompt this agent gets." /> : null}
          {state.turns.map((turn, index) => (
            <TurnView
              key={turn.id}
              turn={turn}
              now={index === state.turns.length - 1 ? now : 0}
              onOpen={(block) => setDetail({ title: `${toolVerb(block.tool)} ${toolTarget(block)}`, input: block.input, output: block.output })}
            />
          ))}
          {state.ended ? <Text style={[type.caption, styles.center]}>{state.ended === 'agent-closed' ? 'The agent closed.' : 'This pane was closed on the desktop.'}</Text> : null}
          {problem ? <Warning text={problem} /> : null}
          {sendProblem ? <Warning text={sendProblem} /> : null}
          {pickProblem ? <Warning text={pickProblem} /> : null}
          {dictation.problem ? <Warning text={dictation.problem} /> : null}
        </ScrollView>
      )}
      {waitingAsk ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Review the request" hitSlop={{ top: 8, bottom: 8 }} onPress={() => setDismissed((all) => all.filter((id) => id !== waitingAsk.askId))} style={styles.waiting}>
          <View style={styles.dot} />
          <Text style={[type.label, styles.waitingText]} numberOfLines={1}>
            {waitingAsk.title}
          </Text>
          <Text style={[type.label, { color: colors.brand }]}>Review</Text>
        </Pressable>
      ) : null}
      {running && canRespond ? (
        <View style={styles.stop}>
          <Button label="Stop" icon={Square} variant="tonal" compact onPress={() => void interruptAgent(paneId, 'esc')} />
        </View>
      ) : null}
      <ChatComposer
        value={text}
        onChangeText={edit}
        onSend={() => void send()}
        allowEmpty={!!attached}
        placeholder={canRespond ? `Message ${agent}` : 'Turn on Respond in Settings › Remote'}
        editable={canRespond && !state.ended}
        sending={sending}
        snippetsFrom={pane?.sessionId ?? null}
        workspaces={sessions.filter((s) => s.kind !== 'scratch' && s.kind !== 'manager')}
        bottomInset={insets.bottom}
        tools={
          <ComposerTools
            listening={dictation.listening}
            onMic={dictation.toggle}
            onPick={(source) => void attach(source)}
            images={images}
            imageUri={attached?.uri ?? null}
            onRemoveImage={() => setAttached(null)}
            disabled={!canRespond || sending}
          />
        }
      />
      <AskSheet
        ask={sheetAsk}
        workspace={workspace?.name ?? ''}
        canRespond={canRespond}
        pending={sheetAsk ? asks.pending[sheetAsk.askId] : undefined}
        error={sheetAsk ? asks.errors[sheetAsk.askId] : undefined}
        onAnswer={(answer) => sheetAsk && void answerAsk(sheetAsk.askId, answer)}
        onClose={() => sheetAsk && setDismissed((all) => [...all, sheetAsk.askId])}
      />
      <Sheet visible={detail !== null} onClose={() => setDetail(null)}>
        {detail ? (
          <View style={styles.detail}>
            <Text style={type.captionStrong} numberOfLines={2}>
              {detail.title}
            </Text>
            <ScrollView {...NO_SCROLL_BARS} style={styles.output}>
              <Text style={styles.outputText} selectable>
                {[detail.input, detail.output].filter(Boolean).join('\n\n') || 'No output.'}
              </Text>
            </ScrollView>
          </View>
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  thread: { paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.lg, gap: space.xl, flexGrow: 1 },
  center: { textAlign: 'center' },
  stop: { alignItems: 'flex-start', paddingHorizontal: space.gutter, paddingBottom: space.sm },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.gutter, marginBottom: space.sm, paddingHorizontal: space.md, minHeight: 36, borderRadius: radius.full, backgroundColor: colors.attnSoft },
  waitingText: { flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.attn },
  detail: { gap: space.sm },
  output: { maxHeight: 480, borderRadius: radius.md, backgroundColor: colors.bgSunken, padding: space.md },
  outputText: { fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: colors.fg },
});

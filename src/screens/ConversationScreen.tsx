import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Bot } from 'lucide-react-native';
import { ChatSwitch } from '../components/ChatSwitch';
import { TurnView } from '../components/ChatBlocks';
import { ChatComposer } from '../components/ChatComposer';
import { ComposerTools } from '../components/ComposerTools';
import { AskSheet } from '../components/AskSheet';
import { Button, Empty, HeaderTitle, Loading, NO_SCROLL_BARS, Sheet, Warning } from '../components/ui';
import { Block, clipTail, toolTarget, toolVerb, Turn, turnRunning } from '../model/agentStream';
import { ATTACH_FAILED, imageRefusal } from '../model/attachment';
import { isPiPane, paneTitle, shortPath } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { answerAsk, interruptAgent, promptAgent, useAsks } from '../services/askStore';
import { useAgentStream } from '../services/agentStream';
import { useDictation } from '../services/dictation';
import { PickedImage, pickImage } from '../services/images';
import { useCaps, useFeatures, useWorkspaces } from '../services/workspaceStore';
import { colors, font, radius, space, type } from '../theme';

const NEAR_BOTTOM = 80;

const Gap = () => <View style={{ height: space.xl }} />;

type ToolBlock = Extract<Block, { kind: 'tool' }>;
type Detail = { turnId: string; blockId: string };

const renderTurn = (turn: Turn, onOpen: (turnId: string, block: ToolBlock) => void) => (
  <TurnView turn={turn} onOpen={(block) => onOpen(turn.id, block)} />
);

export function ConversationScreen({ navigation, route }: ScreenProps<'Conversation'>) {
  const { paneId, title } = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const canRespond = useCaps().includes('respond');
  const images = useFeatures().includes('prompt-image');
  const { sessions, panes } = useWorkspaces();
  const asks = useAsks();
  const [focused, setFocused] = useState(true);
  const pane = panes.find((p) => p.paneId === paneId);
  const pi = pane ? isPiPane(pane) : false;
  const { state, status, problem } = useAgentStream(paneId, focused, !pi);
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
  const scroll = useRef<FlatList<Turn>>(null);
  const ownAsks = asks.asks.filter((ask) => ask.paneId === paneId);
  const sheetAsk = ownAsks.find((ask) => !dismissed.includes(ask.askId)) ?? null;
  const waitingAsk = ownAsks.find((ask) => dismissed.includes(ask.askId)) ?? null;
  const running = turnRunning(state);

  const openTerminal = useCallback(() => navigation.navigate('Terminal', { paneId, title }), [navigation, paneId, title]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={heading} subtitle={[heading === agent ? null : agent, shortPath(pane?.cwd ?? workspace?.workDir)].filter(Boolean).join(' · ')} />,
      headerRight: () => (pi ? null : <ChatSwitch value="chat" onChange={openTerminal} />),
    });
  }, [navigation, heading, agent, pi, pane?.cwd, workspace?.workDir, openTerminal]);

  useEffect(() => {
    if (status === 'terminal') navigation.replace('Terminal', { paneId, title });
  }, [status, navigation, paneId, title]);

  useEffect(() => {
    const removeBlur = navigation.addListener('blur', () => setFocused(false));
    const removeFocus = navigation.addListener('focus', () => setFocused(true));
    return () => {
      removeBlur();
      removeFocus();
    };
  }, [navigation]);

  const openDetail = useCallback((turnId: string, block: ToolBlock) => setDetail({ turnId, blockId: block.id }), []);
  const renderItem = useCallback(({ item }: { item: Turn }) => renderTurn(item, openDetail), [openDetail]);
  const shown = detail ? state.turns.find((turn) => turn.id === detail.turnId)?.blocks.find((block): block is ToolBlock => block.kind === 'tool' && block.id === detail.blockId) : undefined;
  const shownText = shown ? clipTail([shown.input, shown.output].filter(Boolean).join('\n\n') || 'No output.') : null;

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
        <FlatList
          {...NO_SCROLL_BARS}
          ref={scroll}
          data={state.turns}
          keyExtractor={(turn) => turn.id}
          renderItem={renderItem}
          style={styles.fill}
          contentContainerStyle={styles.thread}
          ItemSeparatorComponent={Gap}
          ListEmptyComponent={state.live ? <Empty icon={Bot} title="No turns yet" body="The thread starts at the next prompt this agent gets." /> : null}
          ListFooterComponent={
            <View style={styles.footer}>
              {state.ended ? <Text style={[type.caption, styles.center]}>{state.ended === 'agent-closed' ? 'The agent closed.' : 'This pane was closed on the desktop.'}</Text> : null}
              {problem ? <Warning text={problem} /> : null}
              {sendProblem ? <Warning text={sendProblem} /> : null}
              {pickProblem ? <Warning text={pickProblem} /> : null}
              {dictation.problem ? <Warning text={dictation.problem} /> : null}
            </View>
          }
          onContentSizeChange={() => nearBottom.current && scroll.current?.scrollToEnd({ animated: false })}
          onLayout={() => nearBottom.current && scroll.current?.scrollToEnd({ animated: false })}
          onScroll={({ nativeEvent }) => {
            nearBottom.current = nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height >= nativeEvent.contentSize.height - NEAR_BOTTOM;
          }}
          scrollEventThrottle={100}
          initialNumToRender={8}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
        />
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
            onStop={running && canRespond ? () => void interruptAgent(paneId, 'esc') : undefined}
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
      <Sheet visible={shown !== undefined} onClose={() => setDetail(null)}>
        {shown && shownText ? (
          <View style={styles.detail}>
            <Text style={type.captionStrong} numberOfLines={2}>
              {`${toolVerb(shown.tool)} ${toolTarget(shown)}`}
            </Text>
            <ScrollView {...NO_SCROLL_BARS} style={styles.output}>
              <Text style={styles.outputText} selectable>
                {shownText.hidden > 0 ? `… ${shownText.hidden} earlier characters are on the desktop\n` : ''}
                {shownText.text}
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
  thread: { paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.lg, flexGrow: 1 },
  footer: { gap: space.md, paddingTop: space.md },
  center: { textAlign: 'center' },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.gutter, marginBottom: space.sm, paddingHorizontal: space.md, minHeight: 36, borderRadius: radius.full, backgroundColor: colors.attnSoft },
  waitingText: { flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.attn },
  detail: { gap: space.sm },
  output: { maxHeight: 480, borderRadius: radius.md, backgroundColor: colors.bgSunken, padding: space.md },
  outputText: { fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: colors.fg },
});

import { useSyncExternalStore } from 'react';
import { Ask } from '../model/asks';
import { OstiaRpc } from './rpc';

const METHOD_NOT_FOUND = -32601;

interface AskSnapshot {
  asks: Ask[];
  unsupported: boolean;
  pending: Record<string, string>;
  errors: Record<string, string>;
}

const EMPTY: AskSnapshot = { asks: [], unsupported: false, pending: {}, errors: {} };
let snapshot = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function update(patch: Partial<AskSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _, ...rest } = record;
  return rest;
}

async function loadAsks() {
  try {
    const result = await OstiaRpc.call('ask.list');
    update({ asks: result.asks ?? [], unsupported: false });
  } catch (err: any) {
    update({ asks: [], unsupported: err?.code === METHOD_NOT_FOUND });
  }
}

function start() {
  if (started) return;
  started = true;
  OstiaRpc.addStatusListener((status) => {
    if (status === 'connected') void loadAsks();
    else if (status === 'revoked') update(EMPTY);
  });
  OstiaRpc.addEventListener((type, payload) => {
    if (type === 'ask.created' && payload?.ask) {
      update({ asks: [...snapshot.asks.filter((a) => a.askId !== payload.ask.askId), payload.ask] });
    } else if (type === 'ask.resolved') {
      update({
        asks: snapshot.asks.filter((a) => a.askId !== payload?.askId),
        pending: without(snapshot.pending, payload?.askId),
        errors: without(snapshot.errors, payload?.askId),
      });
    }
  });
  if (OstiaRpc.getStatus() === 'connected') void loadAsks();
}

export function resetAsks() {
  update(EMPTY);
}

export async function answerAsk(askId: string, answer: { choiceId?: string; text?: string }): Promise<void> {
  update({ pending: { ...snapshot.pending, [askId]: answer.choiceId ?? 'text' }, errors: without(snapshot.errors, askId) });
  try {
    await OstiaRpc.call('ask.answer', { askId, ...answer });
  } catch (err: any) {
    update({ pending: without(snapshot.pending, askId), errors: { ...snapshot.errors, [askId]: err?.message || "Couldn't send" } });
  }
}

export function promptAgent(paneId: string, text: string): Promise<unknown> {
  return OstiaRpc.call('agent.prompt', { paneId, text });
}

export function interruptAgent(paneId: string, key: 'esc' | 'ctrl-c'): Promise<unknown> {
  return OstiaRpc.call('agent.interrupt', { paneId, key });
}

export function useAsks(): AskSnapshot {
  start();
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

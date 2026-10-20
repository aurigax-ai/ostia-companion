import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { applyFrame, EMPTY_STREAM, parseFrame, StreamFrame, StreamState } from '../model/agentStream';
import { OstiaRpc } from './rpc';

const NOT_AN_AGENT = 'not-an-agent';
const METHOD_NOT_FOUND = -32601;
const NEEDS_ELEVATION = -32003;
const TURNS = 20;

export type StreamStatus = 'opening' | 'open' | 'terminal' | 'error';

export function streamFailure(err: any, firstOpen: boolean): { status: 'terminal' } | { status: 'error'; text: string } {
  if (err?.message === NOT_AN_AGENT && firstOpen) return { status: 'terminal' };
  if (err?.message === NOT_AN_AGENT) return { status: 'error', text: 'This agent is no longer on the desktop.' };
  if (err?.code === METHOD_NOT_FOUND) return { status: 'error', text: "This desktop's Ostia is too old for chat. Open the terminal, or update Ostia on the desktop." };
  if (err?.code === NEEDS_ELEVATION) return { status: 'error', text: 'Reading the conversation needs Read for this phone in Settings › Remote.' };
  if (err?.message === 'too-many-streams') return { status: 'error', text: 'Too many conversations are open. Close one and come back.' };
  if (err?.message === 'unavailable') return { status: 'error', text: "The desktop could not open this agent's record." };
  return { status: 'error', text: err?.message || 'Could not read the conversation.' };
}

export function useAgentStream(paneId: string, active = true) {
  const [state, setState] = useState<StreamState>(EMPTY_STREAM);
  const [status, setStatus] = useState<StreamStatus>('opening');
  const [problem, setProblem] = useState<string | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    setState(EMPTY_STREAM);
    setStatus('opening');
    setProblem(null);
    opened.current = false;
  }, [paneId]);

  useEffect(() => {
    if (!active) return;
    let generation = 0;
    let streaming = false;
    let receiving = false;
    let expected = 1;
    let queue: StreamFrame[] = [];
    let frame: number | null = null;

    const drop = () => {
      queue = [];
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    const flush = () => {
      frame = null;
      const frames = queue;
      queue = [];
      if (frames.length === 0) return;
      const now = Date.now();
      setState((current) => frames.reduce((next, each) => applyFrame(next, each, now), current));
    };

    const close = () => {
      generation++;
      receiving = false;
      drop();
      if (!streaming) return;
      streaming = false;
      OstiaRpc.call('agent.stream.close', { paneId }).catch(() => {});
    };

    const open = async () => {
      const mine = ++generation;
      streaming = true;
      receiving = false;
      expected = 1;
      drop();
      try {
        await OstiaRpc.call('agent.stream.open', { paneId, turns: TURNS });
        if (mine !== generation) return;
        opened.current = true;
        receiving = true;
        setState(EMPTY_STREAM);
        setProblem(null);
        setStatus('open');
      } catch (err: any) {
        if (mine !== generation) return;
        streaming = false;
        const failure = streamFailure(err, !opened.current);
        setStatus(failure.status);
        setProblem(failure.status === 'error' ? failure.text : null);
      }
    };

    const removeEvents = OstiaRpc.addEventListener((type, payload) => {
      if (type !== 'agent.stream' || payload?.paneId !== paneId || !receiving) return;
      const parsed = parseFrame(payload);
      if (!parsed) return;
      if (parsed.seq !== expected) {
        receiving = false;
        void open();
        return;
      }
      expected = parsed.seq + 1;
      queue.push(parsed);
      if (frame === null) frame = requestAnimationFrame(flush);
    });

    const removeStatus = OstiaRpc.addStatusListener((next) => {
      if (next === 'connected' && AppState.currentState === 'active') void open();
    });

    const removeApp = AppState.addEventListener('change', (next) => {
      if (next === 'background') close();
      else if (next === 'active' && !streaming) void open();
    });

    if (OstiaRpc.getStatus() === 'connected') void open();

    return () => {
      removeEvents();
      removeStatus();
      removeApp.remove();
      close();
    };
  }, [paneId, active]);

  return { state, status, problem };
}

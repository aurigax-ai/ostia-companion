import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Grid, sameGrid } from '../model/terminalFit';
import { OstiaRpc } from './rpc';

export type HoldStatus = 'off' | 'held' | 'taken' | 'refused';

const DEBOUNCE_MS = 200;
const REFUSED_CODES = [-32602, -32003];

export function useTerminalHold({ paneId, active, grid, attachCount }: { paneId: string; active: boolean; grid: Grid | null; attachCount: number }) {
  const [status, setStatus] = useState<HoldStatus>('off');
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const [again, setAgain] = useState(0);
  const [settled, setSettled] = useState<Grid | null>(null);
  const machine = useRef({
    pane: paneId,
    desired: null as Grid | null,
    held: null as Grid | null,
    requested: null as Grid | null,
    busy: false,
    taken: false,
    refused: false,
  }).current;
  const live = active && foreground;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state !== 'background'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!live || !grid) return setSettled(null);
    const timer = setTimeout(() => setSettled(grid), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [live, grid?.cols, grid?.rows]);

  const sync = () => {
    if (machine.busy) return;
    const pane = machine.pane;
    if (machine.desired && !machine.taken && !machine.refused && !sameGrid(machine.held, machine.desired)) {
      const request = machine.desired;
      machine.busy = true;
      machine.requested = request;
      OstiaRpc.holdPty(pane, request.cols, request.rows)
        .then(() => {
          machine.held = request;
          if (machine.pane === pane && sameGrid(machine.desired, request)) setStatus('held');
        })
        .catch((error: { code?: number }) => {
          machine.requested = null;
          if (REFUSED_CODES.includes(error?.code ?? 0)) {
            machine.refused = true;
            setStatus('refused');
          }
        })
        .finally(() => {
          machine.busy = false;
          sync();
        });
    } else if (!machine.desired && machine.held) {
      machine.busy = true;
      machine.held = null;
      machine.requested = null;
      OstiaRpc.releasePty(pane)
        .catch(() => {})
        .finally(() => {
          machine.busy = false;
          sync();
        });
    }
  };

  useEffect(() => {
    machine.pane = paneId;
    machine.desired = null;
    machine.held = null;
    machine.requested = null;
    machine.taken = false;
    machine.refused = false;
    setStatus('off');
    setSettled(null);
    return () => {
      machine.desired = null;
      sync();
    };
  }, [paneId]);

  useEffect(() => {
    machine.desired = live ? settled : null;
    if (!live) {
      machine.taken = false;
      machine.refused = false;
      setStatus('off');
    }
    sync();
  }, [live, settled?.cols, settled?.rows]);

  useEffect(() => {
    if (attachCount === 0) return;
    machine.held = null;
    machine.requested = null;
    machine.taken = false;
    setStatus('off');
    sync();
  }, [attachCount]);

  useEffect(() => {
    if (again === 0) return;
    machine.taken = false;
    machine.refused = false;
    sync();
  }, [again]);

  const noteSize = (cols: number, rows: number) => {
    const size = { cols, rows };
    if (!machine.held || sameGrid(machine.held, size) || sameGrid(machine.requested, size)) return;
    machine.held = null;
    machine.taken = true;
    setStatus('taken');
  };

  return { status, noteSize, holdAgain: () => setAgain((n) => n + 1) };
}

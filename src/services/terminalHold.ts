import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Grid, sameGrid } from '../model/terminalFit';
import { OstiaRpc } from './rpc';

export type HoldStatus = 'off' | 'held' | 'taken' | 'refused';

export function useTerminalHold({ paneId, active, grid }: { paneId: string; active: boolean; grid: Grid | null }) {
  const [status, setStatus] = useState<HoldStatus>('off');
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const [again, setAgain] = useState(0);
  const wanted = useRef<Grid | null>(null);
  const holding = useRef(false);
  const taken = useRef(false);
  const handled = useRef(0);
  const live = active && foreground;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state !== 'background' && state !== 'inactive'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setStatus('off');
    taken.current = false;
    holding.current = false;
    wanted.current = null;
  }, [paneId]);

  useEffect(() => {
    if (!live) return;
    return () => {
      taken.current = false;
      wanted.current = null;
      if (!holding.current) return;
      holding.current = false;
      setStatus('off');
      OstiaRpc.releasePty(paneId).catch(() => {});
    };
  }, [live, paneId]);

  useEffect(() => {
    if (!live || !grid) return;
    const manual = again !== handled.current;
    handled.current = again;
    if (taken.current && !manual) return;
    taken.current = false;
    wanted.current = grid;
    let current = true;
    OstiaRpc.holdPty(paneId, grid.cols, grid.rows)
      .then(() => {
        if (!current || !sameGrid(wanted.current, grid)) return;
        holding.current = true;
        setStatus('held');
      })
      .catch(() => current && setStatus('refused'));
    return () => void (current = false);
  }, [live, paneId, grid?.cols, grid?.rows, again]);

  const noteSize = (cols: number, rows: number) => {
    if (!holding.current || sameGrid(wanted.current, { cols, rows })) return;
    holding.current = false;
    taken.current = true;
    setStatus('taken');
  };

  return { status, noteSize, holdAgain: () => setAgain((n) => n + 1) };
}

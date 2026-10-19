import { useEffect, useState } from 'react';
import { parseSnippets, Snippet } from '../model/snippets';
import { OstiaRpc } from './rpc';

const cache = new Map<string, Snippet[]>();

export async function loadSnippets(sessionId: string | null): Promise<Snippet[]> {
  const key = sessionId ?? '';
  try {
    const snippets = parseSnippets(await OstiaRpc.call('snippet.list', sessionId ? { sessionId } : {}));
    cache.set(key, snippets);
    return snippets;
  } catch {
    return cache.get(key) ?? [];
  }
}

export function useSnippets(sessionId: string | null): Snippet[] {
  const [snippets, setSnippets] = useState<Snippet[]>(() => cache.get(sessionId ?? '') ?? []);
  useEffect(() => {
    let live = true;
    void loadSnippets(sessionId).then((loaded) => live && setSnippets(loaded));
    return () => {
      live = false;
    };
  }, [sessionId]);
  return snippets;
}

import { AgentName, startFailureText } from '../model/agentStart';
import { OstiaRpc } from './rpc';
import { refreshWorkspaces } from './workspaceStore';

export type StartResult = { ok: true; paneId: string } | { ok: false; text: string };

export async function startAgent(sessionId: string, agent: AgentName, prompt: string): Promise<StartResult> {
  try {
    const result = await OstiaRpc.call('agent.start', { sessionId, agent, prompt });
    if (typeof result?.paneId !== 'string') return { ok: false, text: startFailureText(undefined) };
    await refreshWorkspaces();
    return { ok: true, paneId: result.paneId };
  } catch (err: any) {
    return { ok: false, text: startFailureText(err) };
  }
}

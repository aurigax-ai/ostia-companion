import type { Pane, Session } from '../model/workspaces.ts';

export interface Scenario {
  sessions: Session[];
  panes: Pane[];
}

const MIGRATION = 'Apply this migration to the dev database?\n\nALTER TABLE users\n  ADD COLUMN last_seen timestamptz;';

export function demoScenario(): Scenario {
  return {
    sessions: [
      { sessionId: 's-api', name: 'api-server', kind: 'project', workDir: '/home/marco/work/api-server', state: 'waiting', group: { id: 'g-work', name: 'Work' } },
      { sessionId: 's-web', name: 'website', kind: 'project', workDir: '/home/marco/Personal/site', state: 'error', group: { id: 'g-personal', name: 'Personal' } },
      { sessionId: 's-ostia', name: 'ostia', kind: 'project', workDir: '/home/marco/Personal/ostia', state: 'working', group: { id: 'g-personal', name: 'Personal' } },
      { sessionId: 's-dot', name: 'dotfiles', kind: 'project', workDir: '/home/marco/.config', state: 'done' },
    ],
    panes: [
      { paneId: 'p-claude', sessionId: 's-api', kind: 'terminal', title: 'claude', cwd: '/home/marco/work/api-server', running: true, blockCount: 4, agent: 'claude', agentState: 'waiting', agentMessage: MIGRATION },
      { paneId: 'p-api-zsh', sessionId: 's-api', kind: 'terminal', title: 'zsh', cwd: '/home/marco/work/api-server', running: false, blockCount: 9, lastExitCode: 0 },
      { paneId: 'p-codex', sessionId: 's-web', kind: 'terminal', title: 'codex', cwd: '/home/marco/Personal/site', running: false, blockCount: 3, lastExitCode: 1, agent: 'codex', agentState: 'error', agentMessage: 'Stopped: build failed (exit 1)' },
      { paneId: 'p-agent', sessionId: 's-ostia', kind: 'terminal', title: 'claude', cwd: '/home/marco/Personal/ostia', running: true, blockCount: 2, agent: 'claude', agentState: 'working' },
      { paneId: 'p-dev', sessionId: 's-ostia', kind: 'terminal', title: 'pnpm dev', cwd: '/home/marco/Personal/ostia/web', running: true, blockCount: 1 },
      { paneId: 'p-browser', sessionId: 's-ostia', kind: 'browser', title: 'localhost:5173', running: false, blockCount: 0 },
      { paneId: 'p-editor', sessionId: 's-ostia', kind: 'editor', title: 'theme.ts', running: false, blockCount: 0 },
      { paneId: 'p-dot', sessionId: 's-dot', kind: 'terminal', title: 'zsh', cwd: '/home/marco/.config', running: false, blockCount: 5, lastExitCode: 0, agent: 'claude', agentState: 'done' },
    ],
  };
}

const DIM = '\x1b[90m';
const RESET = '\x1b[0m';
export const PROMPT_OPTIONS = ['Yes', "Yes, and don't ask again", 'No, tell Claude what to do'];

export function agentPromptScreen(selected: number, answered: number | null): string {
  const lines = [
    `\x1b[33m✻${RESET} Claude Code ${DIM}· ~/work/api-server${RESET}`,
    '',
    `\x1b[36m>${RESET} add last_seen to users`,
    '',
    `\x1b[32m●${RESET} Read \x1b[34mdb/schema.sql${RESET}`,
    `\x1b[32m●${RESET} Write \x1b[34mdb/migrations/0042.sql${RESET}`,
    `${DIM}  ⎿ Wrote 2 lines${RESET}`,
    '',
  ];
  if (answered !== null) {
    lines.push(`\x1b[32m●${RESET} ${PROMPT_OPTIONS[answered]}`, `${DIM}  ⎿ Applying migration…${RESET}`);
  } else {
    lines.push(
      `\x1b[35m●${RESET} Apply this migration to the dev database?`,
      '',
      `${DIM}  ALTER TABLE users${RESET}`,
      `${DIM}    ADD COLUMN last_seen timestamptz;${RESET}`,
      '',
      ...PROMPT_OPTIONS.map((option, index) =>
        index === selected ? `\x1b[33m❯ ${index + 1}. ${option}${RESET}` : `  ${index + 1}. ${option}`,
      ),
    );
  }
  return `\x1b[2J\x1b[H${lines.join('\r\n')}`;
}

export function shellScreen(pane: Pane): string {
  if (pane.paneId === 'p-codex') {
    return `${DIM}$${RESET} pnpm build\r\n\x1b[31merror${RESET} TS2322: Type 'string' is not assignable to type 'number'.\r\n  src/pricing.ts:42:7\r\n\x1b[31mBuild failed${RESET} (exit 1)\r\n`;
  }
  if (pane.paneId === 'p-dev') return `${DIM}$${RESET} pnpm dev\r\n  VITE ready in 312 ms\r\n  ➜  Local:   http://localhost:5173/\r\n`;
  return `\x1b[32m${(pane.cwd ?? '~').replace('/home/marco', '~')}${RESET} $ `;
}

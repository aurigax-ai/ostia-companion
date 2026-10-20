import type { Ask } from '../model/asks.ts';
import type { Pane, Session } from '../model/workspaces.ts';

export interface Scenario {
  sessions: Session[];
  panes: Pane[];
  asks: Ask[];
  files: Record<string, Record<string, string>>;
  artifacts: Record<string, Record<string, string>>;
  streams: Record<string, Record<string, unknown>[]>;
  snippets: MockSnippet[];
}

export interface MockSnippet {
  name: string;
  description?: string;
  command: string;
  arguments: { name: string; description?: string; defaultValue?: string }[];
  source: 'user' | 'workspace';
  sessionId?: string;
}

const REPORT = `# Release plan

Ship **0.4** on Friday. Open questions are in the [tracker](https://example.com/tracker).

![remote chart](https://example.com/chart.png)

<script>alert('raw html is shown as text')</script>

- [x] changelog
- [ ] smoke test on staging

| step | owner |
|---|---|
| build | ci |
| notes | marco |

\`\`\`mermaid
graph TD
  build --> staging --> production
\`\`\`
`;

const CHART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" fill="#202020"/><polyline points="10,50 40,30 70,38 110,10" fill="none" stroke="#f2b347" stroke-width="3"/></svg>\n';

const MIGRATION = 'Apply this migration to the dev database?\n\nALTER TABLE users\n  ADD COLUMN last_seen timestamptz;';

export function demoScenario(): Scenario {
  return {
    sessions: [
      { sessionId: 's-api', name: 'api-server', kind: 'agent', workDir: '/home/marco/work/api-server', state: 'waiting', group: { id: 'g-work', name: 'Work' } },
      { sessionId: 's-web', name: 'website', kind: 'agent', workDir: '/home/marco/Personal/site', state: 'error', group: { id: 'g-personal', name: 'Personal' } },
      { sessionId: 's-ostia', name: 'ostia', kind: 'agent', workDir: '/home/marco/Personal/ostia', state: 'working', group: { id: 'g-personal', name: 'Personal' } },
      { sessionId: 's-dot', name: 'dotfiles', kind: 'agent', workDir: '/home/marco/.config', state: 'done' },
    ],
    panes: [
      { paneId: 'p-claude', sessionId: 's-api', kind: 'terminal', title: 'claude', cwd: '/home/marco/work/api-server', running: true, blockCount: 4, agent: 'claude', agentState: 'waiting', agentMessage: MIGRATION },
      { paneId: 'p-api-zsh', sessionId: 's-api', kind: 'terminal', title: 'zsh', cwd: '/home/marco/work/api-server', running: false, blockCount: 9, lastExitCode: 0 },
      { paneId: 'p-codex', sessionId: 's-web', kind: 'terminal', title: 'codex', cwd: '/home/marco/Personal/site', running: false, blockCount: 3, lastExitCode: 1, agent: 'codex', agentState: 'error', agentMessage: 'Stopped: build failed (exit 1)' },
      { paneId: 'p-agent', sessionId: 's-ostia', kind: 'terminal', title: 'claude', cwd: '/home/marco/Personal/ostia', running: true, blockCount: 2, agent: 'claude', agentState: 'working' },
      { paneId: 'p-pi', sessionId: 's-ostia', kind: 'agent', title: 'pi', running: true, blockCount: 0 },
      { paneId: 'p-dev', sessionId: 's-ostia', kind: 'terminal', title: 'pnpm dev', cwd: '/home/marco/Personal/ostia/web', running: true, blockCount: 1 },
      { paneId: 'p-browser', sessionId: 's-ostia', kind: 'browser', title: 'localhost:5173', running: false, blockCount: 0 },
      { paneId: 'p-editor', sessionId: 's-ostia', kind: 'editor', title: 'theme.ts', running: false, blockCount: 0 },
      { paneId: 'p-dot', sessionId: 's-dot', kind: 'terminal', title: 'zsh', cwd: '/home/marco/.config', running: false, blockCount: 5, lastExitCode: 0, agent: 'claude', agentState: 'done' },
    ],
    files: {
      's-ostia': {
        'README.md': '# ostia\n\nA terminal for agents.\n',
        '.env': 'PORT=5173\n',
        'package.json': '{\n  "name": "ostia",\n  "private": true\n}\n',
        'src/main.ts': "import { start } from './app';\n\nstart();\n",
        'src/app.ts': 'export function start() {\n  console.log("ready");\n}\n',
        'logs/build.log': 'x'.repeat(300 * 1024),
        'assets/logo.bin': '\u0000\u0001\u0002binary',
      },
    },
    artifacts: {
      's-ostia': {
        'PAD.md': '# Scratch Pad\n\n- try the new palette on the phone\n',
        'release-plan.md': REPORT,
        'latency.svg': CHART,
        'flow.mmd': 'sequenceDiagram\n  phone->>desktop: fs.read\n  desktop-->>phone: text\n',
        'timings.csv': 'route,p50,p95\n/pair,12,40\n"/ws, attach",3,9\n',
        'Counter.tsx': "import { useState } from 'react';\n\nexport default function Counter() {\n  const [n, setN] = useState(0);\n  return <button onClick={() => setN(n + 1)}>{n}</button>;\n}\n",
        'dashboard/index.html': '<!doctype html>\n<title>Dashboard</title>\n<script>document.title = "ready";</script>\n',
        'dashboard/data.json': '{ "ok": true }\n',
        'dashboard/deep/more.txt': 'too deep to be an artifact\n',
        'trace.log': 'héllo wörld €\n'.repeat(40_000),
        'shot.png': '\u0089PNG\u0000\u0001'.repeat(60_000),
      },
      's-web': {},
    },
    streams: {
      'p-agent': [
        { type: 'turn.started', turn: 1 },
        { type: 'prompt', turn: 1, id: 'pr-1', text: 'The month export repeats the totals row. Fix it and run the export tests.' },
        { type: 'tool', turn: 1, id: 'tl-1', kind: 'read', name: 'Read', target: 'src/export/month.ts' },
        { type: 'tool', turn: 1, id: 'tl-2', kind: 'command', name: 'Bash', target: 'pnpm test src/export', input: 'pnpm test src/export' },
        { type: 'tool.result', turn: 1, id: 'tl-2', output: ' FAIL  src/export/month.test.ts\n  × keeps the header in each month (12 ms)\n    expected 10.01, got 10.00\nTests  1 failed | 60 passed\n', exitCode: 1 },
        { type: 'text', turn: 1, id: 'tx-1', text: "The totals row is pushed again when the header already holds it. I'll guard that push." },
        { type: 'edit', turn: 1, id: 'ed-1', path: 'src/export/month.ts', change: 'update', diff: '@@ -41,4 +41,6 @@\n   const rows = header(month)\n-  rows.push(total)\n+  if (!rows.includes(total)) {\n+    rows.push(total)\n+  }\n   return rows\n' },
        { type: 'plan', turn: 1, id: 'pl-1', items: [{ text: 'Guard the totals row in month export', status: 'done' }, { text: 'Apply the same guard to CSV export', status: 'done' }, { text: 'Push the branch and open a PR', status: 'active' }, { text: 'Note the fix in the changelog', status: 'pending' }] },
        { type: 'tool', turn: 1, id: 'tl-3', kind: 'command', name: 'Bash', target: 'pnpm test src/export', input: 'pnpm test src/export' },
        { type: 'tool.result', turn: 1, id: 'tl-3', output: ' ✓ src/export/month.test.ts (14 tests)\nTests  61 passed\n', exitCode: 0 },
        { type: 'text', turn: 1, id: 'tx-2', text: 'All 61 export tests pass now. The CSV export builds rows the same way, so it gets the same guard.' },
        { type: 'turn.ended', turn: 1, status: 'done' },
        { type: 'turn.started', turn: 2 },
        { type: 'prompt', turn: 2, id: 'pr-2', text: 'Run the export tests too, and skip the slow fixtures.' },
        { type: 'tool', turn: 2, id: 'tl-4', kind: 'search', name: 'Grep', target: 'slow fixtures' },
        { type: 'text', turn: 2, id: 'tx-3', text: 'Looking for the slow fixtures so the run can skip them' },
      ],
      'p-claude': [
        { type: 'turn.started', turn: 1 },
        { type: 'prompt', turn: 1, id: 'pr-1', text: 'Add last_seen to users.' },
        { type: 'tool', turn: 1, id: 'tl-1', kind: 'read', name: 'Read', target: 'db/schema.sql' },
        { type: 'tool', turn: 1, id: 'tl-2', kind: 'edit', name: 'Write', target: 'db/migrations/0042.sql' },
        { type: 'edit', turn: 1, id: 'tl-2', path: 'db/migrations/0042.sql', change: 'add', diff: '@@ -0,0 +1,2 @@\n+ALTER TABLE users\n+  ADD COLUMN last_seen timestamptz;\n' },
        { type: 'text', turn: 1, id: 'tx-1', text: 'The migration is written. Applying it to the dev database next.' },
      ],
      'p-pi': [
        { type: 'turn.started', turn: 1 },
        { type: 'prompt', turn: 1, id: 'pr-1', text: 'What changed in the export module this week?' },
        { type: 'tool', turn: 1, id: 'tl-1', kind: 'command', name: 'bash', target: 'git log --since=1.week src/export', input: 'git log --since=1.week src/export' },
        { type: 'tool.result', turn: 1, id: 'tl-1', output: 'a1b2c3 guard the totals row\n9f8e7d split the ledger export\n', exitCode: 0 },
        { type: 'text', turn: 1, id: 'tx-1', text: 'Two commits touched it: the ledger export now splits by month, and the totals row is guarded against a repeat.' },
        { type: 'turn.ended', turn: 1, status: 'done' },
      ],
      'p-codex': [
        { type: 'turn.started', turn: 1 },
        { type: 'prompt', turn: 1, id: 'pr-1', text: 'Build the site.' },
        { type: 'tool', turn: 1, id: 'tl-1', kind: 'command', name: 'shell', target: 'pnpm build' },
        { type: 'tool.result', turn: 1, id: 'tl-1', output: 'error: Cannot find module ./theme\n', exitCode: 1 },
        { type: 'turn.ended', turn: 1, status: 'failed' },
      ],
      'p-dot': [
        { type: 'turn.started', turn: 1 },
        { type: 'prompt', turn: 1, id: 'pr-1', text: 'Tidy my zsh aliases.' },
        { type: 'text', turn: 1, id: 'tx-1', text: 'Done. I merged the duplicate aliases.' },
        { type: 'turn.ended', turn: 1, status: 'done' },
      ],
    },
    snippets: [
      { name: 'standup', description: "Draft my standup from yesterday's work", command: 'Draft my standup for {{day}}', arguments: [{ name: 'day', defaultValue: 'yesterday' }], source: 'user' },
      { name: 'release-notes', description: 'Write release notes for the last tag', command: 'Write release notes since {{tag}}', arguments: [{ name: 'tag' }], source: 'workspace', sessionId: 's-ostia' },
    ],
    asks: [
      {
        askId: 'ask-migration',
        sessionId: 's-api',
        paneId: 'p-claude',
        kind: 'permission',
        agent: 'claude',
        title: 'Run Bash: apply the migration to the dev database?',
        detail: 'psql "$DEV_DATABASE_URL" -f db/migrations/0042.sql\n\nALTER TABLE users\n  ADD COLUMN last_seen timestamptz;',
        choices: [
          { id: 'allow-once', label: 'Allow once', tone: 'approve' },
          { id: 'allow-always', label: 'Always allow', tone: 'neutral' },
          { id: 'deny', label: 'Deny', tone: 'deny' },
        ],
        allowText: false,
        since: Date.now() - 3 * 60_000,
      },
      {
        askId: 'ask-target',
        sessionId: 's-ostia',
        paneId: 'p-agent',
        kind: 'question',
        agent: 'claude',
        title: 'Which environment should the release notes cover?',
        choices: [
          { id: 'staging', label: 'Staging', tone: 'neutral' },
          { id: 'production', label: 'Production', tone: 'neutral' },
        ],
        allowText: true,
        since: Date.now() - 60_000,
      },
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

export function agentTranscriptScreen(): string {
  const lines = [`\x1b[33m✻${RESET} Claude Code ${DIM}· ~/Personal/ostia${RESET}`, ''];
  for (let turn = 1; turn <= 14; turn++) {
    lines.push(
      `\x1b[36m>${RESET} turn ${turn}: split the ledger export and keep the header`,
      '',
      `\x1b[32m●${RESET} Read \x1b[34msrc/export/ledger.ts${RESET}`,
      `${DIM}  ⎿ Read 212 lines${RESET}`,
      `\x1b[32m●${RESET} Update \x1b[34msrc/export/month.ts${RESET}`,
      `${DIM}  ⎿ Updated with 6 additions and 2 removals${RESET}`,
      `\x1b[32m●${RESET} Bash ${DIM}pnpm test export${RESET}`,
      `${DIM}  ⎿ Tests  ${turn * 4} passed${RESET}`,
      `\x1b[32m●${RESET} Turn ${turn} is done; every month keeps its CSV header.`,
      '',
    );
  }
  lines.push(
    '╭──────────────────────────────────────────────────────────╮',
    '│ >                                                        │',
    '╰──────────────────────────────────────────────────────────╯',
    `${DIM}  ? for shortcuts${RESET}`,
  );
  return `${lines.join('\r\n')}\r\n`;
}

export const SHELL_PROMPT = '\x1b]133;A\x07$ \x1b]133;B\x07';

export function ranCommand(command: string, output: string, exitCode: number): string {
  return `${SHELL_PROMPT}${command}\r\n\x1b]133;C\x07${output}\x1b]133;D;${exitCode}\x07`;
}

export const VIM_SCREEN =
  '\x1b[?1049h\x1b[2J\x1b[H' +
  Array.from({ length: 12 }, (_, i) => `\x1b[90m${String(i + 53).padStart(3)}\x1b[0m  const row${i} = totals(month, ${i});`).join('\r\n') +
  '\x1b[28;1H\x1b[7m src/export/csv.ts [+]                      59,20   71% \x1b[0m\x1b[29;1H-- INSERT --';

export function shellScreen(pane: Pane): string {
  if (pane.paneId === 'p-codex') {
    return `${ranCommand('pnpm build', `\x1b[31merror${RESET} TS2322: Type 'string' is not assignable to type 'number'.\r\n  src/pricing.ts:42:7\r\n\x1b[31mBuild failed${RESET} (exit 1)\r\n`, 1)}${SHELL_PROMPT}`;
  }
  if (pane.paneId === 'p-dev') {
    const log = Array.from({ length: 400 }, (_, i) => `${DIM}${String(i + 1).padStart(3, '0')}${RESET} [vite] hmr update /src/components/Row${i % 17}.tsx`);
    return `${SHELL_PROMPT}pnpm dev\r\n\x1b]133;C\x07  VITE ready in 312 ms\r\n  ➜  Local:   http://localhost:5173/\r\n${log.join('\r\n')}\r\n`;
  }
  if (pane.paneId === 'p-agent') return agentTranscriptScreen();
  const cwd = (pane.cwd ?? '~').replace('/home/marco', '~');
  return (
    ranCommand('git status -sb', `## main...origin/main\r\n\x1b[31m M\x1b[0m src/export/month.ts\r\n\x1b[32mA \x1b[0m src/export/csv.ts\r\n`, 0) +
    ranCommand(
      'pnpm test export',
      `${DIM}RUN${RESET}  v2.1.0 ${cwd}\r\n\x1b[32m✓${RESET} src/export/csv.test.ts (12 tests) 31ms\r\n\x1b[31m✗${RESET} src/export/month.test.ts > repeats the totals row when the header already holds it, which is the bug under test\r\n   AssertionError: expected 62 rows to be 61 rows\r\n\r\n Test Files  1 failed | 1 passed (2)\r\n      Tests  1 failed | 61 passed (62)\r\n`,
      1,
    ) +
    SHELL_PROMPT
  );
}

export interface Shortcut {
  name: string;
  hint: string;
  needsWorkspace?: boolean;
  phoneOnly?: boolean;
  fill: (workspace?: string) => string;
}

export const SHORTCUTS: Shortcut[] = [
  { name: '/summary', hint: 'What changed today across my workspaces', fill: () => 'What changed today across my workspaces?' },
  { name: '/status', hint: 'What is running and what needs me', fill: () => 'What is running, and what needs me?' },
  { name: '/review', hint: 'Review the last changes in a workspace', needsWorkspace: true, fill: (workspace) => `Review the last changes in ${workspace}` },
  { name: '/storage', hint: 'Free up space on this phone', phoneOnly: true, fill: () => 'Free up space on this phone: find apps I have not opened in 3 months' },
  { name: '/later', hint: 'Save this for later', fill: () => 'Save this for later: ' },
];

export function shortcutsFor(text: string, phoneControl: boolean): Shortcut[] {
  if (!/^\/\S*$/.test(text)) return [];
  const typed = text.toLowerCase();
  return SHORTCUTS.filter((shortcut) => (phoneControl || !shortcut.phoneOnly) && shortcut.name.startsWith(typed));
}

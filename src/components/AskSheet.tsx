import React from 'react';
import { Ask } from '../model/asks';
import { PermissionSheet } from './PermissionSheet';

export function AskSheet({
  ask,
  workspace,
  canRespond,
  pending,
  error,
  onAnswer,
  onClose,
}: {
  ask: Ask | null;
  workspace: string;
  canRespond: boolean;
  pending?: string;
  error?: string;
  onAnswer: (answer: { choiceId?: string; text?: string }) => void;
  onClose: () => void;
}) {
  const where = [workspace, ask?.agent].filter(Boolean).join(' · ');
  return <PermissionSheet ask={ask} where={where} canRespond={canRespond} pending={pending} error={error} onAnswer={onAnswer} onClose={onClose} />;
}

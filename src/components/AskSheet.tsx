import React from 'react';
import { Ask } from '../model/asks';
import { AskCard } from './AskCard';
import { Sheet } from './ui';

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
  return (
    <Sheet visible={ask !== null} onClose={onClose}>
      {ask ? <AskCard ask={ask} workspace={workspace} canRespond={canRespond} pending={pending} error={error} onAnswer={onAnswer} flat /> : null}
    </Sheet>
  );
}

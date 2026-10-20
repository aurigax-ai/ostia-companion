import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RawKeyboard } from './TerminalKeys';

function setup() {
  const onText = jest.fn();
  const onBackspace = jest.fn();
  const onEnter = jest.fn();
  return { onText, onBackspace, onEnter, ui: <RawKeyboard onText={onText} onBackspace={onBackspace} onEnter={onEnter} /> };
}

test('CRD-C60 an IME composition sends nothing until it is committed, then sends the composed text once', async () => {
  const { ui, onText } = setup();
  await render(ui);
  const field = screen.getByLabelText('Type to the terminal');
  await fireEvent.changeText(field, 'n');
  await fireEvent.changeText(field, 'ni');
  await fireEvent.changeText(field, '你');
  await fireEvent.changeText(field, '你好');
  expect(onText).not.toHaveBeenCalled();
  await fireEvent(field, 'endEditing');
  expect(onText).toHaveBeenCalledTimes(1);
  expect(onText).toHaveBeenCalledWith('你好');
});

test('CRD-C61 enter sends the text and then a return, and a backspace on an empty field goes to the terminal', async () => {
  const { ui, onText, onEnter, onBackspace } = setup();
  await render(ui);
  const field = screen.getByLabelText('Type to the terminal');
  await fireEvent(field, 'keyPress', { nativeEvent: { key: 'Backspace' } });
  expect(onBackspace).toHaveBeenCalledTimes(1);
  await fireEvent.changeText(field, 'ls');
  await fireEvent(field, 'keyPress', { nativeEvent: { key: 'Backspace' } });
  expect(onBackspace).toHaveBeenCalledTimes(1);
  await fireEvent(field, 'submitEditing');
  expect(onText).toHaveBeenCalledWith('ls');
  expect(onEnter).toHaveBeenCalledTimes(1);
});

test('CRD-C62 a pasted multi-line text arrives whole', async () => {
  const { ui, onText } = setup();
  await render(ui);
  const field = screen.getByLabelText('Type to the terminal');
  await fireEvent.changeText(field, 'one\ntwo');
  await fireEvent(field, 'endEditing');
  expect(onText).toHaveBeenCalledWith('one\ntwo');
});

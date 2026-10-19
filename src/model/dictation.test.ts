import { describe, expect, it } from 'vitest';
import { dictationProblem, withDictation } from './dictation';

describe('dictation', () => {
  it('puts what was heard after the draft with one space between', () => {
    expect(withDictation('', 'run the tests')).toBe('run the tests');
    expect(withDictation('please', ' run the tests ')).toBe('please run the tests');
    expect(withDictation('please ', 'run it')).toBe('please run it');
    expect(withDictation('keep this', '  ')).toBe('keep this');
  });

  it('says nothing for silence or an abort and words every other error', () => {
    expect(dictationProblem('no-speech')).toBeNull();
    expect(dictationProblem('aborted')).toBeNull();
    expect(dictationProblem('not-allowed')).toMatch(/microphone/);
    expect(dictationProblem('weird')).toBe("Couldn't dictate. Try again.");
  });
});

import { describe, expect, test } from 'vite-plus/test';

import { VoiceCapture, voiceCommand } from './voiceCommands';
import { KEYWORDS } from './voiceKeywords';

describe('bidding voice commands', () => {
  test('accepts only the declared auction phrases', () => {
    expect(voiceCommand('BID_ONE')).toEqual({ type: 'bid', amount: 1 });
    expect(voiceCommand('BID_TWENTY')).toEqual({ type: 'bid', amount: 20 });
    expect(voiceCommand('BID_PLUS_ONE')).toEqual({ type: 'raise' });
    expect(voiceCommand('PASS')).toEqual({ type: 'pass' });
    expect(voiceCommand('RESET')).toEqual({ type: 'reset' });
    for (const value of ['FIVE', '5', 'bid five', 'BID_ZERO', 'BID_TWENTY_ONE', 'RESUME', 'START']) {
      expect(voiceCommand(value)).toBeNull();
    }
    const aliases = [...new Set(KEYWORDS.split('\n').map((line) => line.split('@')[1]))];
    expect(aliases).toHaveLength(23);
    for (const alias of aliases) {
      expect(voiceCommand(alias)).not.toBeNull();
    }
  });

  test('late recognition cannot act on a later opportunity for the same faction', () => {
    const capture = new VoiceCapture<{ faction: string; opportunity: number }>();
    const first = capture.set({ faction: 'fremen', opportunity: 1 }, 'table:instance:1');
    expect(capture.take(first)).toEqual({ faction: 'fremen', opportunity: 1 });
    capture.set({ faction: 'fremen', opportunity: 3 }, 'table:instance:3');
    expect(capture.take(first)).toBeNull();
    expect(capture.take(capture.current())).toEqual({ faction: 'fremen', opportunity: 3 });
  });

  test('pausing, stopping and replacement fence captured input and copy its context', () => {
    const capture = new VoiceCapture<{ opportunity: number }>();
    const original = { opportunity: 1 };
    const first = capture.set(original, 'old:1');
    original.opportunity = 9;
    expect(capture.take(first)).toEqual({ opportunity: 1 });
    capture.set(null, null);
    expect(capture.take(first)).toBeNull();
    const resumed = capture.set({ opportunity: 1 }, 'new:1');
    expect(resumed).not.toBe(first);
    expect(capture.take(first)).toBeNull();
  });
});

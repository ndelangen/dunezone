import { TABLE_CONVERSATION, recallConversation } from '@shared/play/conversations';
import { describe, expect, it } from 'vite-plus/test';

import { newMessageSound } from './chatSounds';

const summary = (peerId: string, unread: number) => ({ peerId, unread, latest: 0, cleared: 0 }) as never;

describe('newMessageSound (#2982)', () => {
  it('stays silent on the first summaries and after a reset, so a (re)connection never chimes', () => {
    expect(newMessageSound(null, [summary(TABLE_CONVERSATION, 3)], [])).toBeNull();
    expect(newMessageSound([], [summary('fremen', 2)], [])).toBeNull();
  });

  it('sounds by where the message was written', () => {
    const before = [summary(TABLE_CONVERSATION, 0), summary('fremen', 0), summary('harkonnen', 0)];
    expect(newMessageSound(before, [summary(TABLE_CONVERSATION, 1)], ['fremen'])).toBe('chat-table');
    expect(newMessageSound(before, [summary(recallConversation('r1'), 1)], [])).toBe('chat-table');
    expect(newMessageSound(before, [summary('fremen', 1)], ['fremen'])).toBe('chat-ally');
    expect(newMessageSound(before, [summary('harkonnen', 1)], ['fremen'])).toBe('chat-other');
  });

  it('plays the more personal sound when several arrive together, and nothing when a count falls', () => {
    const before = [summary(TABLE_CONVERSATION, 0), summary('fremen', 0), summary('harkonnen', 2)];
    expect(
      newMessageSound(
        before,
        [summary(TABLE_CONVERSATION, 1), summary('fremen', 1), summary('harkonnen', 3)],
        ['fremen']
      )
    ).toBe('chat-ally');
    expect(newMessageSound(before, [summary('harkonnen', 0)], [])).toBeNull();
  });
});

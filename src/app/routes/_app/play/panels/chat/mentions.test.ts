import { describe, expect, test } from 'vite-plus/test';

import { completeMention, matchMentions, mentionQuery, splitMentions } from './mentions';
import type { Mention } from './mentions';

function mention(id: string, label: string, detail: string | null = null): Mention {
  return { id, label, detail, token: { id, name: label } };
}

const PAULA = mention('seat-9', 'Paula');

const MENTIONS = [
  mention('seat-1', 'House Atreides', 'Paula'),
  mention('seat-2', 'Harkonnen', 'Sam'),
  mention('seat-3', 'Fremen', 'Ana'),
  mention('seat-4', 'fremen'),
];

describe('mentionQuery', () => {
  test('an @ at the start or after a space opens a mention', () => {
    expect(mentionQuery({ text: '@pa', caret: 3 })).toEqual({ at: 0, query: 'pa' });
    expect(mentionQuery({ text: 'hi @', caret: 4 })).toEqual({ at: 3, query: '' });
    expect(mentionQuery({ text: 'hi (@fr', caret: 7 })).toEqual({ at: 4, query: 'fr' });
  });

  test('an @ inside a word, after a line break, or followed by a space opens none', () => {
    expect(mentionQuery({ text: 'me@home', caret: 7 })).toBeNull();
    expect(mentionQuery({ text: '@pa\nx', caret: 5 })).toBeNull();
    expect(mentionQuery({ text: '@ pa', caret: 4 })).toBeNull();
    expect(mentionQuery({ text: 'no at sign', caret: 5 })).toBeNull();
  });

  test('only the text before the caret counts', () => {
    expect(mentionQuery({ text: '@paula rest', caret: 3 })).toEqual({ at: 0, query: 'pa' });
  });
});

describe('matchMentions', () => {
  test("a player's name finds their faction", () => {
    expect(matchMentions(MENTIONS, { at: 0, query: 'sa' }).map((entry) => entry.label)).toEqual(['Harkonnen']);
  });

  test('names starting with the query come first, then names with a word starting with it', () => {
    expect(matchMentions(MENTIONS, { at: 0, query: 'a' }).map((entry) => entry.id)).toEqual(['seat-3', 'seat-1']);
  });

  test('case and accents do not matter, and two seats sharing a faction name both show', () => {
    expect(matchMentions(MENTIONS, { at: 0, query: 'FRÉ' }).map((entry) => entry.id)).toEqual(['seat-3', 'seat-4']);
  });

  test('an empty query suggests everyone; one that matches nobody suggests nothing', () => {
    expect(matchMentions(MENTIONS, { at: 0, query: '' })).toHaveLength(4);
    expect(matchMentions(MENTIONS, { at: 0, query: 'zz' })).toEqual([]);
  });
});

describe('completeMention', () => {
  test('writes the name and one space, with the caret after it', () => {
    expect(completeMention({ text: 'hi @pa', caret: 6 }, { at: 3, query: 'pa' }, PAULA)).toEqual({
      text: 'hi @Paula ',
      caret: 10,
    });
  });

  test('steps over a space that already follows instead of writing a second', () => {
    expect(completeMention({ text: '@pa there', caret: 3 }, { at: 0, query: 'pa' }, PAULA)).toEqual({
      text: '@Paula there',
      caret: 7,
    });
  });

  test('keeps a line break that follows and still writes the space', () => {
    expect(completeMention({ text: '@pa\nnext', caret: 3 }, { at: 0, query: 'pa' }, PAULA)).toEqual({
      text: '@Paula \nnext',
      caret: 7,
    });
  });
});

describe('splitMentions', () => {
  test('cuts out each faction named after an @, the longest name first, keeping the text as written, with every seat of that name', () => {
    const named = [...MENTIONS, mention('seat-5', 'House')];
    expect(splitMentions('ask @house atreides, not @Fremen.', named)).toEqual([
      { text: 'ask ' },
      { text: '@house atreides', seats: [named[0]] },
      { text: ', not ' },
      { text: '@Fremen', seats: [named[2], named[3]] },
      { text: '.' },
    ]);
  });

  test('a name two seats share means both of them', () => {
    const shared = [...MENTIONS, mention('seat-6', 'Fremen', 'Bo')];
    expect(splitMentions('@Fremen', shared)).toEqual([{ text: '@Fremen', seats: [shared[2], shared[3], shared[4]] }]);
  });

  test('leaves an @ inside a word, a name running on into a longer word, and an unknown name as text', () => {
    expect(splitMentions('me@Fremen @Fremenish @Nobody', MENTIONS)).toEqual([{ text: 'me@Fremen @Fremenish @Nobody' }]);
  });
});

import { describe, expect, test } from 'vite-plus/test';

import { completeMention, matchMentions, mentionQuery, splitMentions } from './mentions';
import type { Mention } from './mentions';

function mention(id: string, label: string, detail: string | null = null): Mention {
  return { id, label, detail, token: { id, name: label } };
}

const MENTIONS = [
  mention('seat-1', 'House Atreides', 'Paula'),
  mention('seat-2', 'Harkonnen', 'Ridwan'),
  mention('seat-3', 'Fremen', 'Ana'),
  mention('seat-4', 'fremen'),
];

describe('mentionQuery', () => {
  test('an @ at the start or after a space opens a mention', () => {
    expect(mentionQuery('@pa', 3)).toEqual({ at: 0, query: 'pa' });
    expect(mentionQuery('hi @', 4)).toEqual({ at: 3, query: '' });
    expect(mentionQuery('hi (@fr', 7)).toEqual({ at: 4, query: 'fr' });
  });

  test('an @ inside a word, after a line break, or followed by a space opens none', () => {
    expect(mentionQuery('me@home', 7)).toBeNull();
    expect(mentionQuery('@pa\nx', 5)).toBeNull();
    expect(mentionQuery('@ pa', 4)).toBeNull();
    expect(mentionQuery('no at sign', 5)).toBeNull();
  });

  test('only the text before the caret counts', () => {
    expect(mentionQuery('@paula rest', 3)).toEqual({ at: 0, query: 'pa' });
  });
});

describe('matchMentions', () => {
  test("a player's name finds their faction", () => {
    expect(matchMentions(MENTIONS, 'rid').map((entry) => entry.label)).toEqual(['Harkonnen']);
  });

  test('names starting with the query come first, then names with a word starting with it', () => {
    expect(matchMentions(MENTIONS, 'a').map((entry) => entry.id)).toEqual(['seat-3', 'seat-1']);
  });

  test('case and accents do not matter, and each faction shows once', () => {
    expect(matchMentions(MENTIONS, 'FRÉ').map((entry) => entry.id)).toEqual(['seat-3']);
  });

  test('an empty query suggests everyone; one that matches nobody suggests nothing', () => {
    expect(matchMentions(MENTIONS, '')).toHaveLength(3);
    expect(matchMentions(MENTIONS, 'zz')).toEqual([]);
  });
});

describe('completeMention', () => {
  test('writes the name and one space, with the caret after it', () => {
    expect(completeMention('hi @pa', { at: 3, query: 'pa' }, 6, 'Paula')).toEqual({ text: 'hi @Paula ', caret: 10 });
  });

  test('steps over a space that already follows instead of writing a second', () => {
    expect(completeMention('@pa there', { at: 0, query: 'pa' }, 3, 'Paula')).toEqual({
      text: '@Paula there',
      caret: 7,
    });
  });

  test('keeps a line break that follows and still writes the space', () => {
    expect(completeMention('@pa\nnext', { at: 0, query: 'pa' }, 3, 'Paula')).toEqual({
      text: '@Paula \nnext',
      caret: 7,
    });
  });
});

describe('splitMentions', () => {
  test('cuts out each faction named after an @, the longest name first, keeping the text as written', () => {
    const named = [...MENTIONS, mention('seat-5', 'House')];
    expect(splitMentions('ask @house atreides, not @Fremen.', named)).toEqual([
      { text: 'ask ' },
      { text: '@house atreides', mention: named[0] },
      { text: ', not ' },
      { text: '@Fremen', mention: named[2] },
      { text: '.' },
    ]);
  });

  test('leaves an @ inside a word, a name running on into a longer word, and an unknown name as text', () => {
    expect(splitMentions('me@Fremen @Fremenish @Nobody', MENTIONS)).toEqual([{ text: 'me@Fremen @Fremenish @Nobody' }]);
  });
});

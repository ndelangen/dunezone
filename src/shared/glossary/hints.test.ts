import { describe, expect, test } from 'vitest';

import { distinctTermHints, findTermHints } from './hints';
import { GLOSSARY } from './terms';
import type { GlossaryTerm } from './terms';

function summary(text: string) {
  return findTermHints(text).map((hint) => [hint.found, hint.term.term]);
}

describe('findTermHints', () => {
  test('suggests the preferred term for an avoided word', () => {
    expect(summary('Ship 3 forces to Arrakeen.')).toEqual([['forces', 'Troop']]);
  });

  test('matches whole words only, ignoring case', () => {
    expect(summary('Combat is fierce. Their strongholds are safe.')).toEqual([['Combat', 'Battle']]);
    expect(summary('Abattoirs and fighters')).toEqual([]);
  });

  test('reports a phrase once rather than also reporting the word inside it', () => {
    expect(summary('Two elite forces land.')).toEqual([['elite forces', 'Elite troop']]);
  });

  test('matches a phrase across a line break', () => {
    expect(summary('Before ship &\nmove begins')).toEqual([['ship & move', 'Shipment and Movement']]);
  });

  test('leaves names and fixed phrases that contain an avoided word alone', () => {
    expect(summary('House Atreides plays Cheap Hero and sends troops to the Tleilaxu Tanks.')).toEqual([]);
    expect(summary('Every house may send a hero to their tanks.')).toEqual([
      ['house', 'Faction'],
      ['hero', 'Leader'],
      ['tanks', 'Tleilaxu Tanks'],
    ]);
  });

  test('excuses names in any case, and leaves the site name alone', () => {
    expect(summary('HOUSE ATREIDES and Houses Atreides and Harkonnen')).toEqual([]);
    expect(summary('Welcome to Dune Zone, where Dead Cheap Heroes and Desert Power live.')).toEqual([]);
  });

  test('leaves the verb force alone and still hints the plural noun', () => {
    expect(summary('You may force your opponent to reveal it. Ship two forces.')).toEqual([['forces', 'Troop']]);
  });

  test('shows a phrase split over lines as one spaced phrase', () => {
    expect(distinctTermHints('ship &\nmove, then ship  &  move').map((hint) => hint.found)).toEqual(['ship & move']);
  });

  test('skips words the glossary keeps out of hints', () => {
    expect(summary('A round token in this area.')).toEqual([]);
  });

  test('returns hints in reading order', () => {
    expect(findTermHints('Fight with your forces').map((hint) => hint.index)).toEqual([0, 16]);
  });
});

describe('findTermHints with a custom glossary', () => {
  const custom: GlossaryTerm[] = [
    {
      id: 'plan',
      term: 'Battle plan',
      topic: 'battle',
      explanation: '',
      reason: '',
      source: 'rulebook',
      avoid: [{ word: 'combat plan' }, { word: 'a.b (c)+' }, { word: 'quiet', hint: false }],
    },
    {
      id: 'battle',
      term: 'Battle',
      topic: 'battle',
      explanation: '',
      reason: '',
      source: 'rulebook',
      avoid: [{ word: 'combat' }],
    },
  ];

  test('lets a longer phrase of one term win over a shorter word of another', () => {
    expect(findTermHints('Reveal your combat plan.', custom).map((hint) => hint.term.id)).toEqual(['plan']);
  });

  test('treats regex characters in an avoided word literally', () => {
    expect(findTermHints('see a.b (c)+ here, not aXb (c)', custom).map((hint) => hint.found)).toEqual(['a.b (c)+']);
  });

  test('never hints a word marked hint: false', () => {
    expect(findTermHints('a quiet combat', custom).map((hint) => hint.found)).toEqual(['combat']);
  });
});

describe('distinctTermHints', () => {
  test('collapses repeats of the same spelling', () => {
    expect(distinctTermHints('forces, forces and Forces').map((hint) => hint.found)).toEqual(['forces']);
  });
});

describe('GLOSSARY', () => {
  test('gives every term a unique id', () => {
    const ids = GLOSSARY.map((term) => term.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('never avoids a word another term prefers', () => {
    const preferred = new Set(GLOSSARY.map((term) => term.term.toLowerCase()));
    const avoided = GLOSSARY.flatMap((term) =>
      term.avoid.flatMap((word) => [word.word, ...(word.forms ?? [])].map((form) => form.toLowerCase()))
    );
    expect(avoided.filter((word) => preferred.has(word))).toEqual([]);
  });

  test('never lets two terms avoid the same word', () => {
    const avoided = GLOSSARY.flatMap((term) =>
      term.avoid.flatMap((word) => [word.word, ...(word.forms ?? [])].map((form) => form.toLowerCase()))
    );
    expect(avoided.filter((word, index) => avoided.indexOf(word) !== index)).toEqual([]);
  });

  test('stays fast on a long draft full of matches', () => {
    const draft = 'house '.repeat(2000) + 'House Atreides '.repeat(500);
    const started = performance.now();
    expect(findTermHints(draft)).toHaveLength(2000);
    expect(performance.now() - started).toBeLessThan(250);
  });

  test('never hints against its own preferred terms', () => {
    expect(GLOSSARY.flatMap((term) => findTermHints(term.term).map((hint) => [term.term, hint.found]))).toEqual([]);
  });
});

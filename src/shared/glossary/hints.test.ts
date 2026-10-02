import { describe, expect, test } from 'vitest';

import { distinctTermHints, findTermHints } from './hints';
import { GLOSSARY } from './terms';

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
    expect(summary('Before ship &\nmove begins')).toEqual([['ship &\nmove', 'Shipment and Movement']]);
  });

  test('leaves names and fixed phrases that contain an avoided word alone', () => {
    expect(summary('House Atreides plays Cheap Hero and sends troops to the Tleilaxu Tanks.')).toEqual([]);
    expect(summary('Every house may send a hero to the tanks.')).toEqual([
      ['house', 'Faction'],
      ['hero', 'Leader'],
      ['tanks', 'Tleilaxu Tanks'],
    ]);
  });

  test('skips words the glossary keeps out of hints', () => {
    expect(summary('A round token in this area.')).toEqual([]);
  });

  test('returns hints in reading order', () => {
    expect(findTermHints('Fight with your forces').map((hint) => hint.index)).toEqual([0, 16]);
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

  test('never hints against its own preferred terms', () => {
    expect(GLOSSARY.flatMap((term) => findTermHints(term.term).map((hint) => [term.term, hint.found]))).toEqual([]);
  });
});

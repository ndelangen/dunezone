import { expect, test } from 'vitest';

import { parseFormattedText } from '../formattedText';
import { publishingTreacheryCard } from './fixtures/publishingTreacheryCard';
import { treacheryToCustomCard } from './treacheryToCustomCard';

test('conversion keeps the Head, Symbol, About and the treachery rules geometry', () => {
  const original = {
    ...publishingTreacheryCard,
    iconScale: 1.6,
    iconOffset: [3, -5] as [number, number],
    iconInvert: true,
    iconOpacity: 0.8,
  };
  const { decals: _decals, text, ...head } = original;
  const converted = treacheryToCustomCard(original);
  expect(converted).toEqual({
    ...head,
    format: 'decal-window',
    layers: [
      expect.objectContaining({ ...original.decals[0], offset: [0, 218.5], kind: 'decal', behindFrame: true }),
      expect.objectContaining({
        kind: 'text',

        offset: [-361, 72.5],
        width: 734,
        height: 499,
        size: 40,
        opacity: 0.937,
      }),
    ],
  });
  const rules = converted.layers.find((layer) => layer.kind === 'text')!;
  expect(parseFormattedText(rules.content)).toEqual(parseFormattedText(text));
});

test('muted decals retain their original position below unmuted decals', () => {
  const solid = { ...publishingTreacheryCard.decals[0]!, offset: [12, -200] as [number, number] };
  const muted = { ...solid, muted: true, scale: 2 };
  const converted = treacheryToCustomCard({ ...publishingTreacheryCard, decals: [solid, muted] });
  expect(converted.layers.slice(0, 2)).toEqual([
    expect.objectContaining({ muted: true, scale: 2, offset: [12, -361.5] }),
    expect.objectContaining({ muted: false, offset: [12, -361.5] }),
  ]);
  expect(new Set(converted.layers.map((layer) => layer.layerId)).size).toBe(3);
});

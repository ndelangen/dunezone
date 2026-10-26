import { expect, test } from 'vite-plus/test';

import * as guidance from './panelGuidance';

/*
 * A window's (?) reads as a few short lines, never a wall of text (Norbert, 2026-10-27).
 * The caps hold the words the app writes itself; a faction's own phase instructions are its author's to keep.
 */
const MAX_LINE = 100;
const MAX_LINES = 4;

/* Every fixed (?) text: each guidance's description with its help under it, and each help on its own. */
const texts = Object.entries(guidance).flatMap(([name, value]) => {
  if (typeof value === 'string') {
    return [[name, value] as const];
  }
  if (value && typeof value === 'object' && 'description' in value) {
    return [[name, guidance.helpLines(value.description, value.help)] as const];
  }
  return [];
});

test.each(texts)('%s stays a few short lines', (_name, text) => {
  const lines = text.split('\n');
  expect(lines.length).toBeLessThanOrEqual(MAX_LINES);
  for (const line of lines) {
    expect(line.length, line).toBeLessThanOrEqual(MAX_LINE);
  }
});

test('the hand and spice window covers both panels', () => {
  expect(guidance.HAND_AND_SPICE_GUIDANCE.help).toBe(
    guidance.helpLines(guidance.HAND_HELP, guidance.SPICE_RESERVE_HELP)
  );
});

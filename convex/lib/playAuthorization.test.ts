import { describe, expect, test } from 'vitest';

import { PLAY_FIXTURE_KEY } from '../../src/shared/play/admission';
import type { Id } from '../_generated/dataModel';
import { admitsPlayers, syntheticFixtureKey } from './playAuthorization';

const synthetic = syntheticFixtureKey();

/**
 * Players may enter a real game or a synthetic test game, and no other row (#1323).
 * A deny list naming the hosted fixture would admit the unknown key and the row with neither field.
 * A synthetic-key match without both anchors, or on the prefix alone, would admit one of the altered keys.
 */
describe('admitsPlayers', () => {
  test.each([
    { label: 'a real game', game: { ruleset_id: 'ruleset' as Id<'rulesets'> } },
    { label: 'a synthetic test game', game: { fixture_key: synthetic } },
  ])('admits $label', ({ game }) => {
    expect(admitsPlayers(game)).toBe(true);
  });

  test.each([
    { label: 'the hosted fixture', game: { fixture_key: PLAY_FIXTURE_KEY } },
    { label: 'a game under an unknown fixture key', game: { fixture_key: 'another-game' } },
    { label: 'a game with neither a ruleset nor a fixture key', game: {} },
    { label: 'a synthetic key with text before it', game: { fixture_key: `copy-${synthetic}` } },
    { label: 'a synthetic key with text after it', game: { fixture_key: `${synthetic}-copy` } },
    { label: 'the synthetic prefix alone', game: { fixture_key: 'synthetic-' } },
  ])('refuses $label', ({ game }) => {
    expect(admitsPlayers(game)).toBe(false);
  });
});

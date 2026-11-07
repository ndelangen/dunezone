import { isTroopStack } from '@shared/play/troop';
import { TUTORIAL_CHECKPOINTS, TUTORIAL_RECIPE } from '@shared/tutorial/recipe';
import { describe, expect, test } from 'vite-plus/test';

import { LocalTable } from '../table/localTable';
import setup from './setup.json';
import { startAt } from './tutorialSetup';
import type { TutorialSetup } from './tutorialSetup';

/*
 * Every chapter starts from a checkpoint of the recorded setup, through the game Worker's own table.
 * A change to the Worker that the recording can no longer open fails here: re-record with `bun run tutorial:record`.
 */
describe('the tutorial setup', () => {
  test.each(TUTORIAL_CHECKPOINTS)('opens %s on the table, as the learner sees it', (checkpoint) => {
    const table = new LocalTable(startAt(setup as unknown as TutorialSetup, checkpoint, 'https://dune.zone'));
    const { snapshot, viewer } = table.frame();
    expect(viewer.viewerSeat).toBe(TUTORIAL_RECIPE.learner);
    /* Before the deal the learner has a seat but no faction yet, and the table is still bare. */
    if (snapshot.stage !== 'drafting') {
      expect(snapshot.bank?.factionId).toBeTruthy();
      expect(snapshot.table.pieces.length).toBeGreaterThan(0);
    }
    table.dispose();
  });

  test('takes only the troop stacks off a chapter without troops', () => {
    const recorded = setup as unknown as TutorialSetup;
    const full = startAt(recorded, 'turn-1-storm', 'https://dune.zone').stored;
    const bare = startAt(recorded, 'turn-1-storm', 'https://dune.zone', { withoutTroops: true }).stored;
    const others = full.table.pieces.filter((piece) => !isTroopStack(piece));
    expect(full.table.pieces.length).toBeGreaterThan(others.length);
    expect(bare.table.pieces).toEqual(others);
    expect(Object.keys(bare.versions).sort()).toEqual(others.map((piece) => piece.id).sort());
  });

  test('refuses a chapter without troops before the deal', () => {
    expect(() =>
      startAt(setup as unknown as TutorialSetup, 'drafting', 'https://dune.zone', { withoutTroops: true })
    ).toThrow(/before the deal/);
  });

  test('shows only the site’s own published images', () => {
    const addresses = JSON.stringify(setup).match(/"[^"]*\/published\/[^"]*"/g) ?? [];
    expect(addresses.length).toBeGreaterThan(0);
    expect(addresses.filter((address) => !address.startsWith('"{{origin}}/published/'))).toEqual([]);
  });
});

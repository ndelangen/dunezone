import { describe, expect, it } from 'vite-plus/test';

import { CatalogueCapture, playReadiness } from './catalogueCapture';
import type { CatalogueReads } from './catalogueCapture';
import { arrakisBoardCapture } from './fixtures/board';

const ORIGIN = 'https://dune.zone';

/* A catalogue that answers only what each test gives it; anything else reads as absent. */
function catalogue(answers: { rulesets?: Record<string, unknown>; factions?: Record<string, unknown> }) {
  const reads: CatalogueReads = {
    rulesetSupply: async (id) => answers.rulesets?.[id] ?? null,
    factionDefinition: async (id) => answers.factions?.[id] ?? null,
    assetSupply: async () => null,
  };
  return new CatalogueCapture(reads, ORIGIN);
}

const kiss = { id: 'kiss', slug: 'kiss', name: 'KISS' };

describe('playReadiness', () => {
  it('names both required decks of a ruleset that slots none, by their labels', async () => {
    const report = await playReadiness(
      catalogue({ rulesets: { kiss: { ruleset: kiss, board: arrakisBoardCapture, slots: [] } } }),
      kiss,
      []
    );
    expect(report).toEqual([
      {
        kind: 'ruleset',
        id: 'kiss',
        name: 'KISS',
        problems: [
          { subject: 'Treachery deck', reason: 'A ruleset needs a non-empty treachery deck.' },
          { subject: 'Spice deck', reason: 'A ruleset needs a non-empty spice deck.' },
        ],
      },
    ]);
  });

  it('names a slotted asset the catalogue cannot supply by its slot label and name', async () => {
    const slot = (name: string, type: 'deck' | 'bundle', key: string) => ({
      slot: key,
      asset: { id: name, slug: name, name, type },
    });
    const [ruleset] = await playReadiness(
      catalogue({
        rulesets: {
          gf9: {
            ruleset: { id: 'gf9', slug: 'gf9', name: 'GF9' },
            board: arrakisBoardCapture,
            slots: [slot('Homeworld Reserves', 'bundle', 'customTokens')],
          },
        },
      }),
      { id: 'gf9', name: 'GF9' },
      []
    );
    expect(ruleset?.problems).toContainEqual({
      subject: 'Custom token bundles: Homeworld Reserves',
      reason: 'This asset has no complete playable definition.',
    });
  });

  it('turns a refused ruleset or faction into its one problem, so the rest is still judged', async () => {
    const report = await playReadiness(
      catalogue({ rulesets: { kiss: { ruleset: kiss, board: null, slots: [] } } }),
      kiss,
      [{ id: 'gone', name: 'Deleted faction' }]
    );
    expect(report).toEqual([
      {
        kind: 'ruleset',
        id: 'kiss',
        name: 'KISS',
        problems: [{ subject: 'ruleset', reason: 'This ruleset has no usable board.' }],
      },
      {
        kind: 'faction',
        id: 'gone',
        name: 'Deleted faction',
        problems: [{ subject: 'faction', reason: 'This faction is not available.' }],
      },
    ]);
  });
});

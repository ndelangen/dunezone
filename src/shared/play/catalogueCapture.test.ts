import { describe, expect, it } from 'vite-plus/test';

import { publishingCustomDeckCardback } from '../assets/fixtures/publishingDeckCardback';
import { publishingTreacheryCard } from '../assets/fixtures/publishingTreacheryCard';
import { CatalogueCapture, playReadiness } from './catalogueCapture';
import type { CatalogueReads } from './catalogueCapture';
import { arrakisBoardCapture } from './fixtures/board';

const ORIGIN = 'https://dune.zone';

/* A catalogue that answers only what each test gives it; anything else reads as absent. */
function catalogue(answers: {
  rulesets?: Record<string, unknown>;
  factions?: Record<string, unknown>;
  assets?: Record<string, unknown>;
}) {
  const reads: CatalogueReads = {
    rulesetSupply: async (id) => answers.rulesets?.[id] ?? null,
    factionDefinition: async (id) => answers.factions?.[id] ?? null,
    assetSupply: async (selection) => answers.assets?.[selection.slug] ?? null,
  };
  return new CatalogueCapture(reads, ORIGIN);
}

const kiss = { id: 'kiss', slug: 'kiss', name: 'KISS' };

/* A Treachery card and a deck of two copies of each card, as the catalogue supplies them. */
const blankSupply = { members: [], membersTruncated: false, backToken: null, backDeck: null };
function cardSupply(id: string) {
  return {
    ...blankSupply,
    asset: { id, type: 'card-treachery', slug: id, name: id, data: publishingTreacheryCard },
    front: `/published/cards/${id}/card.jpg`,
    back: null,
    backMode: null,
  };
}
function deckSupply(id: string, cards: ReturnType<typeof cardSupply>[]) {
  return {
    ...blankSupply,
    asset: {
      id,
      type: 'deck',
      slug: id,
      name: id,
      data: { name: id, about: '', cardback: publishingCustomDeckCardback },
    },
    members: cards.map((card) => ({ ...card, count: 2 })),
    front: null,
    back: `/published/decks/${id}/cardback.jpg`,
    backMode: 'authored-cardback',
  };
}

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

  it('lists the problems in the order the ruleset editor shows the slots', async () => {
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
            slots: [slot('Extra cards', 'deck', 'custom'), slot('Gears', 'bundle', 'techToken')],
          },
        },
      }),
      { id: 'gf9', name: 'GF9' },
      []
    );
    expect(ruleset?.problems.map((problem) => problem.subject)).toEqual([
      'Treachery deck',
      'Spice deck',
      'Tech token bundle: Gears',
      'Custom decks: Extra cards',
    ]);
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

describe('captureTreacheryDeck', () => {
  it('reads a ruleset without a board, which a game refuses but the standalone tracker needs only the deck of', async () => {
    const capture = catalogue({ rulesets: { kiss: { ruleset: kiss, board: null, slots: [] } } });
    await expect(capture.captureRuleset('kiss')).rejects.toThrow('This ruleset has no usable board.');
    await expect(capture.captureTreacheryDeck('kiss')).resolves.toBeNull();
  });

  it('captures the slotted deck of a ruleset without a board', async () => {
    const deck = deckSupply('treachery-deck', [cardSupply('card-one'), cardSupply('card-two')]);
    const capture = catalogue({
      rulesets: {
        kiss: {
          ruleset: kiss,
          board: null,
          slots: [
            { slot: 'treachery', asset: { id: 'treachery-deck', slug: 'treachery-deck', name: 'Cards', type: 'deck' } },
          ],
        },
      },
      assets: { 'treachery-deck': deck },
    });
    const captured = await capture.captureTreacheryDeck('kiss');
    expect(captured?.asset).toMatchObject({ id: 'treachery-deck', type: 'deck' });
    expect(captured?.contents?.members).toEqual([
      { assetId: 'card-one', count: 2 },
      { assetId: 'card-two', count: 2 },
    ]);
  });

  it('says why a slotted deck cannot be used, rather than calling it missing', async () => {
    const capture = catalogue({
      rulesets: {
        kiss: {
          ruleset: kiss,
          board: null,
          slots: [{ slot: 'treachery', asset: { id: 'cards', slug: 'cards', name: 'Cards', type: 'deck' } }],
        },
      },
    });
    await expect(capture.captureTreacheryDeck('kiss')).rejects.toThrow(
      'The Treachery deck cannot be used. This asset has no complete playable definition.'
    );
  });

  it('refuses a ruleset the catalogue does not have', async () => {
    await expect(catalogue({}).captureTreacheryDeck('gone')).rejects.toThrow('This ruleset is not available.');
  });
});

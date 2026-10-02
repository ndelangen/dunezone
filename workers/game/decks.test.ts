import { expect, test } from 'vitest';

import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { toStoredHeroKey } from '../../src/shared/factions/schema';
import { applyPieceAction } from '../../src/shared/play/commands';
import { factionSupply, piece, place } from '../../src/shared/play/setupSupply';
import { deckCommand } from './decks';
import { hostedFixturePlan } from './fixture';
import type { StoredSnapshot } from './state';

const TRAITOR_BACK = 'https://table.test/published/cardback-presets/traitor/cardback.jpg';
const DREAMRULES_BACK = 'https://table.test/published/decks/dreamrules-treachery-deck/cardback.jpg';

test('a deal renames the deck it leaves by the word on its back, and a shuffle keeps its name', () => {
  let next = 0;
  /* Atreides' Traitor deck as setup places it: one card per leader, on the published Traitor back. */
  const traitors = factionSupply(
    {
      faction: { id: 'atreides', slug: 'atreides', name: 'Atreides' },
      capturedAt: 0,
      definition: toStoredHeroKey(assetPublishingFaction),
      components: {
        token: { front: null, back: null },
        leaders: [],
        troops: [],
        alliance: { front: null, back: null },
        traitors: {
          back: TRAITOR_BACK,
          cards: assetPublishingFaction.leaders.map((leader) => ({
            memberId: leader.memberId,
            name: leader.name,
            front: `https://table.test/published/factions/atreides/${leader.memberId}.jpg`,
          })),
        },
      },
      extras: [],
      readiness: { ready: true, problems: [] },
    },
    0,
    { id: () => `supply-${next++}`, shuffle: (items) => items }
  ).traitors[0]!;
  /* The Dreamrules deck as a catalogue spawn lands on the table, under its own name. */
  const dreamrules = place(
    {
      ...piece(
        'dreamrules',
        'Dreamrules Treachery Deck',
        'shared',
        '#d5ba8c',
        'card',
        'deck:dreamrules-treachery-deck'
      ),
      items: [0, 1, 2].map((index) => ({
        id: `dreamrules-${index}`,
        faceUp: false,
        artwork: {
          front: `https://table.test/published/decks/dreamrules-treachery-deck/${index}.jpg`,
          back: DREAMRULES_BACK,
          backName: 'Treachery',
          name: `Card ${index}`,
          type: 'card-treachery',
        },
      })),
    },
    [6, 0, 6]
  );
  const fixture = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  let snapshot: StoredSnapshot = { ...fixture, table: { ...fixture.table, pieces: [traitors, dreamrules] } };
  const label = (id: string) => snapshot.table.pieces.find((candidate) => candidate.id === id)?.label;

  snapshot = deckCommand(snapshot, 'atreides', { kind: 'deck-shuffle', pieceId: dreamrules.id });
  expect(label(dreamrules.id)).toBe('Dreamrules Treachery Deck');

  snapshot = deckCommand(snapshot, 'atreides', { kind: 'deck-draw', pieceId: dreamrules.id, recipient: 'harkonnen' });
  expect(label(dreamrules.id)).toBe('Treachery deck');

  const dealt = traitors.items.slice(1).map(() => {
    snapshot = deckCommand(snapshot, 'atreides', { kind: 'deck-draw', pieceId: traitors.id, recipient: 'atreides' });
    return label(traitors.id);
  });
  expect(dealt).toEqual([...Array(traitors.items.length - 2).fill('Traitor deck'), 'Traitor card']);
});

/* A homebrew deck on a custom back whose name was cleared in the deck editor, so its cards carry no back word. */
function homebrewDeck(backName?: string) {
  return place(
    {
      ...piece('homebrew', 'Homebrew Spice Deck', 'shared', '#d5ba8c', 'card', 'deck:homebrew-spice-deck'),
      items: [0, 1, 2].map((index) => ({
        id: `homebrew-${index}`,
        faceUp: false,
        artwork: {
          front: `https://table.test/published/decks/homebrew-spice-deck/${index}.jpg`,
          back: 'https://table.test/published/decks/homebrew-spice-deck/cardback.jpg',
          ...(backName ? { backName } : {}),
          name: `Card ${index}`,
          type: 'card-spice',
        },
      })),
    },
    [6, 0, 6]
  );
}

function tableWith(deck: StoredSnapshot['table']['pieces'][number]): StoredSnapshot {
  const fixture = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  return { ...fixture, table: { ...fixture.table, pieces: [deck] } };
}

test('a deal from a deck whose back has no name leaves a plain deck, never a Treachery one', () => {
  const homebrew = homebrewDeck();
  let snapshot = tableWith(homebrew);
  const labels = [1, 2].map(() => {
    snapshot = deckCommand(snapshot, 'atreides', { kind: 'deck-draw', pieceId: homebrew.id, recipient: 'harkonnen' });
    return snapshot.table.pieces.find((candidate) => candidate.id === homebrew.id)?.label;
  });

  expect(labels).toEqual(['Deck', 'Card']);
});

test.each([
  ['no back word', undefined, 'Card'],
  ['a printed back word', 'Spice', 'Spice card'],
])('a dealt card from a deck with %s is named as a card split off it', (_, backName, expected) => {
  const deck = homebrewDeck(backName);
  const snapshot = tableWith(deck);
  const dealt = deckCommand(snapshot, 'atreides', { kind: 'deck-draw', pieceId: deck.id, recipient: 'harkonnen' });
  const split = applyPieceAction(
    {
      ...snapshot.table,
      viewerSeat: 'atreides',
      viewerFaction: 'atreides',
      factionNames: {},
      selectedPieceId: null,
      draftMove: null,
    },
    { kind: 'split', pieceId: deck.id, count: 1 },
    0
  );

  expect([dealt.factionInventories.harkonnen?.at(-1)?.label, split.pieces.at(-1)?.label]).toEqual([expected, expected]);
});

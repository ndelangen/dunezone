import { Text } from '@mantine/core';
import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { DeckEditor, INITIAL_DECK_DRAFT } from './DeckEditor';
import type { DeckDraft } from './DeckEditor';
import { STOCK_CARDBACKS } from './stockCardbacks';

function draftWith(cardback: DeckDraft['cardback']): DeckDraft {
  return { ...INITIAL_DECK_DRAFT, name: 'Treachery', cardback };
}

const meta = preview.meta({
  title: 'Deck Editor',
  component: DeckEditor,
  args: {
    chapter: 'identity' as const,
    onChapterChange: fn(),
    onSettle: fn(),
    patch: fn(),
    members: [],
    onCountChange: null,
    cardPicker: null,
    backPicker: <Text size="xs">Choose a deck…</Text>,
    backProof: null,
    draft: INITIAL_DECK_DRAFT,
  },
});

/**
 * A stock back, which is where every new deck starts.
 * The tile carries the select naming which stock one, since choosing Stock does not finish the job.
 */
export const CardbackFromStock = meta.story({});

/** Composed here: the same union member as Stock, wearing a different tile, with the fields below. */
export const CardbackComposedHere = meta.story({
  args: {
    draft: draftWith({ mode: 'custom', ...STOCK_CARDBACKS[1]!.cardback, name: 'Hand of the Emperor' }),
  },
});

/** Worn from another deck: the only tile that is a different union member. */
export const CardbackFromAnotherDeck = meta.story({
  args: { draft: draftWith({ mode: 'reference', asset_id: 'another-deck' }) },
});

/** Chosen but not yet picked, the state the reference-without-target warning reads. */
export const CardbackReferenceNotYetPicked = meta.story({
  args: { draft: draftWith({ mode: 'reference', asset_id: null }) },
});

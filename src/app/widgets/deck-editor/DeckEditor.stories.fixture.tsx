import type { DeckDraft } from './DeckEditor';
import { INITIAL_DECK_DRAFT } from './DeckEditor';

export function draftWith(cardback: DeckDraft['cardback']): DeckDraft {
  return { ...INITIAL_DECK_DRAFT, name: 'Treachery', cardback };
}

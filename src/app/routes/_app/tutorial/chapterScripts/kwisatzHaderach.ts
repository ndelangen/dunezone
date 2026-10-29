import type { StoredPiece } from '@shared/play/model';

/* The published tracker used by both the private-side-table and recall lessons. */
export const KWISATZ_HADERACH: StoredPiece = {
  id: 'tutorial-kwisatz-haderach',
  label: 'Kwisatz Haderach',
  owner: '',
  color: '#d5ba8c',
  accent: '#ead9bb',
  items: [
    {
      id: 'tutorial-kwisatz-haderach-card',
      faceUp: true,
      artwork: {
        front: '{{origin}}/published/custom-cards/ns7e41fyyzajd2w392aedttr298gmmvm/card.jpg',
        /* The card is in no deck, so it wears the faction-card back an Atreides alliance card wears; it stays face up here. */
        back: '{{origin}}/published/cardback-presets/alliance/cardback.jpg',
        name: 'Kwisatz Haderach',
        type: 'card-custom',
      },
    },
  ],
  stackKey: 'card:ns7e41fyyzajd2w392aedttr298gmmvm',
  position: [-25, 0, -25],
  orientation: 0,
  zoneId: null,
  locked: false,
  kind: 'card',
};

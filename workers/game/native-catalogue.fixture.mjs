import { publishingDeckCardback } from '../../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingTokenFace } from '../../src/shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../../src/shared/assets/fixtures/publishingTreacheryCard';

/* Catalogue pages as the native peer serves them: enough of a card, deck, token and bundle for a capture. */

const blank = { members: [], membersTruncated: false, backToken: null, backDeck: null };

export function cardPage(id) {
  return {
    ...blank,
    asset: { id, type: 'card-treachery', slug: id, name: id, data: publishingTreacheryCard },
    assetPublishing: { publicationHref: `/published/cards/${id}/card.jpg` },
    resolvedBack: null,
  };
}

export function deckPage(id, cards, count = 2) {
  return {
    ...blank,
    asset: { id, type: 'deck', slug: id, name: id, data: { name: id, about: '', cardback: publishingDeckCardback } },
    members: cards.map((card) => ({ member: card.asset, count })),
    assetPublishing: null,
    resolvedBack: { mode: 'custom', href: `/published/decks/${id}/cardback.jpg` },
  };
}

export function tokenPage(id) {
  return {
    ...blank,
    asset: {
      id,
      type: 'token-disc',
      slug: id,
      name: id,
      data: { name: id, about: '', front: publishingTokenFace, back: { mode: 'same' } },
    },
    assetPublishing: { publicationHref: `/published/tokens/${id}/token.png` },
    resolvedBack: { mode: 'same', href: `/published/tokens/${id}/token.png` },
  };
}

export function bundlePage(id, tokens, count = 3) {
  return {
    ...blank,
    asset: {
      id,
      type: 'bundle',
      slug: id,
      name: id,
      data: { name: id, about: '', band: { label: id, background: publishingTokenFace.background } },
    },
    members: tokens.map((token) => ({ member: token.asset, count })),
    assetPublishing: null,
    resolvedBack: null,
  };
}

export function slot(name, page) {
  const { id, type, slug, name: assetName } = page.asset;
  return { slot: name, asset: { id, type, slug, name: assetName } };
}

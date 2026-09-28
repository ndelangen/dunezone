import { publishingDeckCardback } from '../../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingSpiceCard } from '../../src/shared/assets/fixtures/publishingSpiceCard';
import { publishingTokenFace } from '../../src/shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../../src/shared/assets/fixtures/publishingTreacheryCard';
import { assetSupplySchema } from '../../src/shared/play/capture';

/* Catalogue supplies as the native peer serves them, parsed through the game contract: a card of each type, a deck on each kind of back, a token and a bundle. */

const blank = { members: [], membersTruncated: false, backToken: null, backDeck: null };

export function cardPage(id) {
  return assetSupplySchema.parse({
    ...blank,
    asset: { id, type: 'card-treachery', slug: id, name: id, data: publishingTreacheryCard },
    front: `/published/cards/${id}/card.jpg`,
    back: null,
    backMode: null,
  });
}

export function spiceCardPage(id) {
  return assetSupplySchema.parse({
    ...blank,
    asset: { id, type: 'card-spice', slug: id, name: id, data: { ...publishingSpiceCard, name: id } },
    front: `/published/spice-cards/${id}/card.jpg`,
    back: null,
    backMode: null,
  });
}

export function deckPage(id, cards, count = 2) {
  return assetSupplySchema.parse({
    ...blank,
    asset: { id, type: 'deck', slug: id, name: id, data: { name: id, about: '', cardback: publishingDeckCardback } },
    members: cards.map((card) => ({ ...card, count })),
    front: null,
    back: `/published/decks/${id}/cardback.jpg`,
    backMode: 'authored-cardback',
  });
}

/** A deck on a Cardback preset, whose publication the catalogue serves with that publish's cache token. */
export function presetDeckPage(id, cards, key, count = 2) {
  return assetSupplySchema.parse({
    ...blank,
    asset: { id, type: 'deck', slug: id, name: id, data: { name: id, about: '', cardback: { mode: 'preset', key } } },
    members: cards.map((card) => ({ ...card, count })),
    front: null,
    back: `/published/cardback-presets/${key}/cardback.jpg?v=${key}-1`,
    backMode: 'preset',
  });
}

/** A deck wearing another deck's authored Cardback by reference. */
export function referencingDeckPage(id, cards, target, count = 2) {
  return assetSupplySchema.parse({
    ...blank,
    asset: {
      id,
      type: 'deck',
      slug: id,
      name: id,
      data: { name: id, about: '', cardback: { mode: 'reference', asset_id: target.asset.id } },
    },
    members: cards.map((card) => ({ ...card, count })),
    front: null,
    back: target.back,
    backMode: 'reference',
    backDeck: target.asset,
  });
}

export function tokenPage(id) {
  const face = `/published/tokens/${id}/token.png`;
  return assetSupplySchema.parse({
    ...blank,
    asset: {
      id,
      type: 'token-disc',
      slug: id,
      name: id,
      data: { name: id, about: '', front: publishingTokenFace, back: { mode: 'same' } },
    },
    front: face,
    back: face,
    backMode: 'same',
  });
}

export function bundlePage(id, tokens, count = 3) {
  return assetSupplySchema.parse({
    ...blank,
    asset: {
      id,
      type: 'bundle',
      slug: id,
      name: id,
      data: { name: id, about: '', band: { label: id, background: publishingTokenFace.background } },
    },
    members: tokens.map((token) => ({ ...token, count })),
    front: null,
    back: null,
    backMode: null,
  });
}

export function slot(name, page) {
  const { id, type, slug, name: assetName } = page.asset;
  return { slot: name, asset: { id, type, slug, name: assetName } };
}

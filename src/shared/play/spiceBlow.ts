import { z } from 'zod';

import { legacyHighlightTint } from '../boards/spiceHighlights';
import { tintTerritorySchema } from '../boards/tints';

/* Far more than one card's spice; bounds what one placement spawns. */
const SPICE_BLOW_MAX = 30;
/* A card names one territory, or a few the spice may go to; its spice goes to the first with room. More is a map, not a blow. */
const MAX_BLOW_TERRITORIES = 8;
const MAX_BLOW_SPOTS = 16;
const MAX_BOARD_ID = 160;
const FRAME = 488;
/* The board drawing's frame runs from 0 to just under 488 units each way. */
const frameCoordinate = z.number().min(0).max(FRAME);

/**
 * Where a revealed spice card puts its spice, as the game captured it from the card: how much, the territories it names, and the spots its own map placed tokens on, in the card board's drawing units.
 * The spots only count on the board the card was drawn on.
 */
export const spiceBlowSchema = z.strictObject({
  amount: z.number().int().min(1).max(SPICE_BLOW_MAX),
  territories: z.array(tintTerritorySchema).min(1).max(MAX_BLOW_TERRITORIES),
  spots: z
    .array(z.tuple([frameCoordinate, frameCoordinate]))
    .max(MAX_BLOW_SPOTS)
    .optional(),
  boardId: z.string().min(1).max(MAX_BOARD_ID).optional(),
});
export type SpiceBlow = z.infer<typeof spiceBlowSchema>;

type LegacyCard = { highlights?: unknown; amount?: unknown; board?: unknown };
type LinkedBoard = {
  asset_id?: unknown;
  tints?: { territories?: unknown; stamps?: unknown; outline?: unknown }[];
  tokens?: { x?: unknown; y?: unknown }[];
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/* The territories the card's board stamps with spice. */
function stampedTerritories(link: LinkedBoard): string[] {
  const tints = Array.isArray(link.tints) ? link.tints : [];
  return tints.filter((tint) => strings(tint.stamps).includes('spice')).flatMap((tint) => strings(tint.territories));
}

/* The card's first filled tint: a card that marks more, as a Discovery card marks its token's territory too, names its spice first. */
function firstFilledTerritories(link: LinkedBoard): string[] {
  const tints = Array.isArray(link.tints) ? link.tints : [];
  return strings(tints.find((tint) => !tint.outline)?.territories);
}

/* A token off the board's frame is left out, rather than costing the card its blow. */
const inFrame = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= FRAME;

function linkedSpots(link: LinkedBoard): [number, number][] {
  const tokens = Array.isArray(link.tokens) ? link.tokens : [];
  return tokens.flatMap(({ x, y }) => (inFrame(x) && inFrame(y) ? [[x, y] as [number, number]] : []));
}

/* Legacy highlights, as the card editor carries them onto a saved board: regions are not a place to put spice. */
function highlightTerritories(card: LegacyCard): string[] {
  return (
    legacyHighlightTint(strings(card.highlights) as Parameters<typeof legacyHighlightTint>[0], '')?.territories ?? []
  );
}

function linkOf(card: LegacyCard): LinkedBoard | undefined {
  return card.board && typeof card.board === 'object' ? (card.board as LinkedBoard) : undefined;
}

/* The board a card's map was drawn on, when its ID is one the table can keep. */
function boardIdOf(link: LinkedBoard | undefined): { boardId?: string } {
  const id = link?.asset_id;
  return typeof id === 'string' && id.length <= MAX_BOARD_ID ? { boardId: id } : {};
}

/*
 * Where the card puts its spice: the territories its board stamps with spice; else those its highlights name, which mark only the spice;
 * else its board's first filled tint.
 */
function blowTerritories(card: LegacyCard, link: LinkedBoard | undefined): string[] {
  const stamped = link ? stampedTerritories(link) : [];
  if (stamped.length) {
    return stamped;
  }
  const highlighted = highlightTerritories(card);
  return highlighted.length || !link ? highlighted : firstFilledTerritories(link);
}

/* The blow as the card describes it, before the schema checks it. */
function blowInput(card: LegacyCard) {
  const link = linkOf(card);
  const territories = blowTerritories(card, link);
  const spots = link ? linkedSpots(link).slice(0, MAX_BLOW_SPOTS) : [];
  return {
    amount: card.amount,
    territories: [...new Set(territories)].slice(0, MAX_BLOW_TERRITORIES),
    ...(spots.length ? { spots } : {}),
    ...boardIdOf(link),
  };
}

/**
 * What a spice card's revealed face asks the table to do, read from the card as the catalogue stored it.
 * A card that names no territory, such as Shai-Hulud, has none.
 */
export function spiceBlowOf(type: string, data: unknown): SpiceBlow | undefined {
  if (type !== 'card-spice' || !data || typeof data !== 'object') {
    return undefined;
  }
  const parsed = spiceBlowSchema.safeParse(blowInput(data as LegacyCard));
  return parsed.success ? parsed.data : undefined;
}

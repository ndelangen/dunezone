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

/* The tints that mark the blow: those stamped with spice, or else every filled tint. */
function linkedTerritories(link: LinkedBoard): string[] {
  const tints = Array.isArray(link.tints) ? link.tints : [];
  const stamped = tints.filter((tint) => strings(tint.stamps).includes('spice'));
  const marking = stamped.length ? stamped : tints.filter((tint) => !tint.outline);
  return marking.flatMap((tint) => strings(tint.territories));
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

/**
 * What a spice card's revealed face asks the table to do, read from the card as the catalogue stored it.
 * A card that names no territory, such as Shai-Hulud, has none.
 */
export function spiceBlowOf(type: string, data: unknown): SpiceBlow | undefined {
  if (type !== 'card-spice' || !data || typeof data !== 'object') {
    return undefined;
  }
  const card = data as LegacyCard;
  const link = linkOf(card);
  const linked = link ? linkedTerritories(link) : [];
  /* A linked board that marks no territory falls back to the highlights the card still carries. */
  const territories = linked.length ? linked : highlightTerritories(card);
  const spots = link ? linkedSpots(link) : [];
  const parsed = spiceBlowSchema.safeParse({
    amount: card.amount,
    territories: [...new Set(territories)].slice(0, MAX_BLOW_TERRITORIES),
    ...(spots.length ? { spots: spots.slice(0, MAX_BLOW_SPOTS) } : {}),
    ...boardIdOf(link),
  });
  return parsed.success ? parsed.data : undefined;
}

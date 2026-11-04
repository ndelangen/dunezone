import { z } from 'zod';

import { tintTerritorySchema } from '../boards/tints';

/* Far more than one card's spice; bounds what one placement spawns. */
export const SPICE_BLOW_MAX = 30;
/* A card names one territory, or a few for a split blow; more is a map, not a blow. */
const MAX_BLOW_TERRITORIES = 8;
const MAX_BLOW_SPOTS = 16;
/* The board drawing's frame runs from 0 to just under 488 units each way. */
const frameCoordinate = z.number().min(0).max(488);

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
  boardId: z.string().min(1).max(160).optional(),
});
export type SpiceBlow = z.infer<typeof spiceBlowSchema>;

type LegacyCard = { highlights?: unknown; amount?: unknown; board?: unknown };
type LinkedBoard = {
  asset_id?: unknown;
  tints?: { territories?: unknown; stamps?: unknown; outline?: unknown }[];
  tokens?: { x?: unknown; y?: unknown }[];
};

/* Legacy highlights name territories with hyphens, and regions by type; regions are not a place to put spice. */
const LEGACY_REGIONS = new Set(['sand', 'rock', 'strongholds']);
const LEGACY_TERRITORIES: Record<string, string> = { polar: 'polar_sink' };

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

function linkedSpots(link: LinkedBoard): [number, number][] {
  const tokens = Array.isArray(link.tokens) ? link.tokens : [];
  return tokens.flatMap(({ x, y }) =>
    typeof x === 'number' && typeof y === 'number' ? [[x, y] as [number, number]] : []
  );
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
  const link = card.board && typeof card.board === 'object' ? (card.board as LinkedBoard) : undefined;
  const territories = link
    ? linkedTerritories(link)
    : strings(card.highlights)
        .filter((highlight) => !LEGACY_REGIONS.has(highlight))
        .map((highlight) => LEGACY_TERRITORIES[highlight] ?? highlight.replaceAll('-', '_'));
  const spots = link ? linkedSpots(link) : [];
  const parsed = spiceBlowSchema.safeParse({
    amount: card.amount,
    territories: [...new Set(territories)].slice(0, MAX_BLOW_TERRITORIES),
    ...(spots.length ? { spots: spots.slice(0, MAX_BLOW_SPOTS) } : {}),
    ...(link && typeof link.asset_id === 'string' ? { boardId: link.asset_id } : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

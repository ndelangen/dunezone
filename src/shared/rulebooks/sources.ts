import { z } from 'zod';

import { BACKGROUND, DECAL, GENERIC, ICON, LEADERS, LOGO, PLANET, TEXTURE, TROOP, TROOP_MODIFIER } from '../assetIds';
import { FactionMemberIdSchema } from '../factions/memberIdentity';

/** Source identity stays separate from the captions and explanations an author writes. */
export const rulebookSourceReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('asset'), assetId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('stock'), artworkId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('board'), boardId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('faction'), factionId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('faction-member'), factionId: z.string().min(1), memberId: FactionMemberIdSchema }),
]);
export type RulebookSourceReference = z.infer<typeof rulebookSourceReferenceSchema>;

/** Resolution preserves missing identities, including stock artwork that leaves the maintained catalogue. */
export const rulebookResolvedSourceSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('unselected') }),
  z.strictObject({ status: z.literal('unavailable'), reference: rulebookSourceReferenceSchema }),
  z.strictObject({
    status: z.literal('ready'),
    reference: rulebookSourceReferenceSchema,
    name: z.string(),
    imageUrl: z.string().min(1),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  }),
]);
export type RulebookResolvedSource = z.infer<typeof rulebookResolvedSourceSchema>;

export const RULEBOOK_STOCK_ARTWORK = [
  ...new Set([
    ...BACKGROUND.options,
    ...DECAL.options,
    ...GENERIC.options,
    ...ICON.options,
    ...LEADERS.options,
    ...LOGO.options,
    ...PLANET.options,
    ...TEXTURE.options,
    ...TROOP.options,
    ...TROOP_MODIFIER.options,
  ]),
];
const stockArtworkIds = new Set<string>(RULEBOOK_STOCK_ARTWORK);
export const RULEBOOK_BOARD_ARTWORK = [{ id: 'arrakis', name: 'Arrakis board', imageUrl: '/page/map.svg' }] as const;

export function rulebookArtworkName(path: string): string {
  return path
    .split('/')
    .at(-1)!
    .replace(/\.[^.]+$/, '')
    .replaceAll('-', ' ')
    .replaceAll('_', ' ');
}

/** Maintained artwork resolves locally; database-backed sources resolve in the owning route query. */
export function resolveRulebookArtworkSource(reference: RulebookSourceReference): RulebookResolvedSource | null {
  if (reference.kind === 'stock') {
    return stockArtworkIds.has(reference.artworkId)
      ? { status: 'ready', reference, name: rulebookArtworkName(reference.artworkId), imageUrl: reference.artworkId }
      : { status: 'unavailable', reference };
  }
  if (reference.kind === 'board') {
    const board = RULEBOOK_BOARD_ARTWORK.find(({ id }) => id === reference.boardId);
    return board
      ? { status: 'ready', reference, name: board.name, imageUrl: board.imageUrl }
      : { status: 'unavailable', reference };
  }
  return null;
}

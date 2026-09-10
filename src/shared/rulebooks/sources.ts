import { z } from 'zod';

import { componentGeometrySchema } from '../asset-publishing/componentGeometry';
import { BACKGROUND, DECAL, GENERIC, ICON, LEADERS, LOGO, PLANET, TEXTURE, TROOP, TROOP_MODIFIER } from '../assetIds';
import { FactionMemberIdSchema } from '../factions/memberIdentity';
import { RULEBOOK_BOARD_DEFINITIONS } from './boardDefinitions';

export const rulebookCardSourceReferenceSchema = z.strictObject({
  kind: z.literal('asset'),
  assetId: z.string().min(1),
});
export type RulebookCardSourceReference = z.infer<typeof rulebookCardSourceReferenceSchema>;

/** Source identity stays separate from the captions and explanations an author writes. */
export const rulebookSourceReferenceSchema = z.discriminatedUnion('kind', [
  rulebookCardSourceReferenceSchema,
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
    geometry: componentGeometrySchema.optional(),
    publicationRevision: z.string().min(1).max(256).optional(),
  }),
]);
export type RulebookResolvedSource = z.infer<typeof rulebookResolvedSourceSchema>;

/** Database references use the same image metadata contract while publication may still be pending. */
export const rulebookResolvedAssetsByIdSchema = z.record(
  z.string(),
  rulebookResolvedSourceSchema.options[2].omit({ status: true, reference: true }).extend({
    assetId: z.string(),
    type: z.string(),
    imageUrl: z.string().nullable(),
  })
);
export type RulebookResolvedAssetsById = Readonly<z.infer<typeof rulebookResolvedAssetsByIdSchema>>;

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
export const RULEBOOK_BOARD_ARTWORK = RULEBOOK_BOARD_DEFINITIONS;

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
      ? {
          status: 'ready',
          reference,
          name: board.name,
          imageUrl: board.imageUrl,
          width: board.geometry.width,
          height: board.geometry.height,
          geometry: board.geometry,
          publicationRevision: board.revision,
        }
      : { status: 'unavailable', reference };
  }
  return null;
}

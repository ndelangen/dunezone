import { z } from 'zod';

import { PLAY_PROFILE_SLUG_MAX_LENGTH } from './admission';
import { seatRequestSchema } from './participation';
import { storedPieceSchema, tableCountSchema, tableIdSchema, tablePieceSchema, tableSeatSchema } from './schema';

export const SPAWN_TYPES = [
  'deck',
  'bundle',
  'token-disc',
  'token-leader',
  'token-tech',
  'token-plate',
  'token-pointer',
  'token-enhance',
] as const;
export type SpawnType = (typeof SPAWN_TYPES)[number];

export function isSpawnType(type: string): type is SpawnType {
  return (SPAWN_TYPES as readonly string[]).includes(type);
}

export const spawnSelectionSchema = z.object({ type: z.enum(SPAWN_TYPES), slug: z.string().min(1).max(160) });

/**
 * Every type a game can capture: the spawnable types and single cards.
 * A single card is captured for setup (a faction's Extras) but not offered by the in-play spawn picker, where the newest list would fill with cards.
 * It wears the back of the deck that holds it.
 */
export const CAPTURE_TYPES = [
  'card-treachery',
  'card-spice',
  'card-custom',
  'card-leaderability',
  'card-storm',
  'card-stronghold',
  'card-homeworld',
  'card-nexus',
  ...SPAWN_TYPES,
] as const;
export type CaptureType = (typeof CAPTURE_TYPES)[number];

export const captureSelectionSchema = z.object({ type: z.enum(CAPTURE_TYPES), slug: z.string().min(1).max(160) });
export type CaptureSelection = z.infer<typeof captureSelectionSchema>;

/** How many assets the in-play spawn picker shows at first, and how many more each Load more asks for. */
export const SPAWN_PICKER_STEP = 12;

/** One catalogue asset as the spawn picker lists it: enough to name it and to request it. */
const spawnableAssetSchema = spawnSelectionSchema.extend({
  name: z.string(),
  /* The owner's name, which a search matches as well as the asset's; null for an inactive account. */
  owner: z.string().nullable(),
});
export type SpawnableAsset = z.infer<typeof spawnableAssetSchema>;

/** The catalogue's answer to the spawn picker: the newest spawnable assets, or a search's best matches, up to the limit asked for. */
export const spawnableAssetsSchema = z.object({
  entries: z.array(spawnableAssetSchema),
  /* Whether a larger limit would list more. */
  hasMore: z.boolean(),
  /* Whether the list stopped at its ceiling, so assets past it are reached by searching for them. */
  capped: z.boolean(),
});
export type SpawnableAssets = z.infer<typeof spawnableAssetsSchema>;
export const spawnContentsSchema = z.object({
  assetId: tableIdSchema,
  name: z.string(),
  type: z.enum(CAPTURE_TYPES),
  members: z.array(z.object({ assetId: tableIdSchema, count: tableCountSchema.positive() })),
  definitions: z.array(z.object({ id: tableIdSchema, type: z.string(), data: z.unknown() })),
  pieces: z.array(tablePieceSchema).min(1),
});
export const storedSpawnContentsSchema = spawnContentsSchema.extend({ pieces: z.array(storedPieceSchema).min(1) });
export type SpawnContents = z.infer<typeof spawnContentsSchema>;
export type StoredSpawnContents = z.infer<typeof storedSpawnContentsSchema>;
export type SpawnSelection = z.infer<typeof spawnSelectionSchema>;
const spawnRequestSchema = z.object({
  id: tableIdSchema,
  /* The requester is named by seat, never by user id: only the viewer's own id leaves the server. */
  requesterSeat: tableSeatSchema,
  requesterName: z.string(),
  contents: spawnContentsSchema,
});
export const publicControlsSchema = z.object({
  seats: z.array(tableSeatSchema),
  ready: z.array(tableSeatSchema),
  phaseChangedAt: tableCountSchema,
  requests: z.array(spawnRequestSchema),
  /* Pending seat requests, public to every viewer; a snapshot from before they existed reads as none. */
  seatRequests: z.array(seatRequestSchema).default([]),
  /*
   * Who holds each seat, by public name, avatar and profile slug, stamped at send time; a stored snapshot carries an
   * empty list, and a player from before slugs were carried reads as unlinked.
   */
  players: z
    .array(
      z.object({
        seat: tableSeatSchema,
        name: z.string(),
        avatar: z.string().max(2048).nullable(),
        slug: z.string().min(1).max(PLAY_PROFILE_SLUG_MAX_LENGTH).nullable().default(null),
      })
    )
    .default([]),
});
export const storedControlsSchema = publicControlsSchema.extend({
  requests: z.array(spawnRequestSchema.extend({ contents: storedSpawnContentsSchema })),
});
export type PublicControls = z.infer<typeof publicControlsSchema>;
export type StoredControls = z.infer<typeof storedControlsSchema>;
export function emptyPublicControls(): StoredControls {
  return { seats: [], ready: [], phaseChangedAt: 0, requests: [], seatRequests: [], players: [] };
}
export const publicActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ready'), ready: z.boolean() }),
  z.strictObject({ kind: z.literal('spawn-request'), ...spawnSelectionSchema.shape }),
  z.strictObject({ kind: z.literal('spawn-approve'), requestId: tableIdSchema }),
  z.strictObject({ kind: z.literal('spawn-dismiss'), requestId: tableIdSchema }),
]);
export type PublicAction = z.infer<typeof publicActionSchema>;
const kinds: ReadonlySet<string> = new Set(publicActionSchema.options.map((option) => option.shape.kind.value));
export function isPublicAction(action: { kind: string }): action is PublicAction {
  return kinds.has(action.kind);
}

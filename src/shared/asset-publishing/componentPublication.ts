import { z } from 'zod';

import { FactionMemberIdSchema } from '../factions/memberIdentity';
import { FactionInputSchema, HistoricalFactionPublicationSchema } from '../factions/schema';
import { componentGeometrySchema } from './componentGeometry';

export const FACTION_LEADER_ASSET_TYPE = 'faction-leader' as const;

/** A component URL identifies one member of one faction, independent of its current name or position. */
const factionIdSchema = z.string().regex(/^[0-9a-z]{16,64}$/);
const factionMemberPublicationIdentitySchema = z.strictObject({
  factionId: factionIdSchema,
  memberId: FactionMemberIdSchema,
});

export function factionMemberPublicationId(factionId: string, memberId: string): string {
  const identity = factionMemberPublicationIdentitySchema.parse({ factionId, memberId });
  return `${identity.factionId}.${identity.memberId}`;
}

export function parseFactionMemberPublicationId(value: string) {
  const segments = value.split('.');
  if (segments.length !== 2) {
    return null;
  }
  const result = factionMemberPublicationIdentitySchema.safeParse({ factionId: segments[0], memberId: segments[1] });
  return result.success ? result.data : null;
}

/** Only fields drawn by the complete Leader renderer belong in its capture identity. */
export const factionLeaderAssetDataSchema = factionMemberPublicationIdentitySchema.extend({
  leader: FactionInputSchema.shape.leaders.element.omit({ memberId: true }),
  background: FactionInputSchema.shape.background,
  logo: FactionInputSchema.shape.logo,
});

export type FactionLeaderAssetData = z.infer<typeof factionLeaderAssetDataSchema>;

export function factionLeaderAssetData(
  factionId: string,
  data: unknown,
  memberId: string
): FactionLeaderAssetData | null {
  const faction = HistoricalFactionPublicationSchema.safeParse(data);
  if (!faction.success) {
    return null;
  }
  const member = [faction.data.hero, ...faction.data.leaders].find((candidate) => candidate.memberId === memberId);
  if (!member) {
    return null;
  }
  const { memberId: _memberId, ...leader } = member;
  return factionLeaderAssetDataSchema.parse({
    factionId,
    memberId,
    leader,
    background: faction.data.background,
    logo: faction.data.logo,
  });
}

/** The image and its measured parts are one immutable object. A publication points to the whole object. */
export const componentPublicationEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  assetId: z.string().refine((value) => parseFactionMemberPublicationId(value) !== null),
  revision: z.uuid(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  geometry: componentGeometrySchema,
  image: z.strictObject({
    contentType: z.literal('image/jpeg'),
    base64: z
      .string()
      .min(1)
      .max(2_700_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }),
});
export const COMPONENT_ENVELOPE_MAX_BYTES = 2_800_000;

export function componentEnvelopeKey(assetId: string, revision: string): string {
  if (!parseFactionMemberPublicationId(assetId)) {
    throw new Error('Invalid faction member publication identity');
  }
  const token = z.uuid().parse(revision);
  return `leaders/${assetId}/revisions/${token}.json`;
}

export const resolveComponentDeliveryRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  assetId: z.string().refine((value) => parseFactionMemberPublicationId(value) !== null),
});

export const resolveComponentDeliveryResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ ok: z.literal(true), status: z.literal('missing') }),
  z.strictObject({ ok: z.literal(true), status: z.literal('pending') }),
  z.strictObject({
    ok: z.literal(true),
    status: z.literal('found'),
    revision: z.uuid(),
    publishedAt: z.number(),
  }),
]);
export type ComponentDeliveryResolution = z.infer<typeof resolveComponentDeliveryResponseSchema>;

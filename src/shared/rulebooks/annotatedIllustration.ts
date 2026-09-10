import { z } from 'zod';

import { COMPONENT_ASSET_TYPES } from '../asset-publishing/componentGeometry';
import { assetExplainerBlockSchema, rulebookLocalIdSchema } from './contents';
import { rulebookDesignSchema } from './settings';
import { rulebookSourceReferenceSchema } from './sources';

/** Public annotation URLs contain only the immutable Edition and its Page and Block identities. */
export const rulebookAnnotatedIllustrationIdentitySchema = z.strictObject({
  rulebookId: z.string().regex(/^[0-9a-z_]{16,64}$/),
  editionNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  pageId: rulebookLocalIdSchema,
  blockId: rulebookLocalIdSchema,
});
export type RulebookAnnotatedIllustrationIdentity = z.infer<typeof rulebookAnnotatedIllustrationIdentitySchema>;

export function rulebookAnnotatedIllustrationPath(identity: RulebookAnnotatedIllustrationIdentity): string {
  const { rulebookId, editionNumber, pageId, blockId } = rulebookAnnotatedIllustrationIdentitySchema.parse(identity);
  return `/published/rulebooks/${rulebookId}/editions/${editionNumber}/pages/${pageId}/blocks/${blockId}/illustration.svg`;
}

export function matchRulebookAnnotatedIllustrationPath(pathname: string): RulebookAnnotatedIllustrationIdentity | null {
  if (pathname.length > 256) {
    return null;
  }
  const match =
    /^\/published\/rulebooks\/([^/]+)\/editions\/([1-9]\d*)\/pages\/([^/]+)\/blocks\/([^/]+)\/illustration\.svg$/.exec(
      pathname
    );
  if (!match) {
    return null;
  }
  const parsed = rulebookAnnotatedIllustrationIdentitySchema.safeParse({
    rulebookId: match[1],
    editionNumber: Number(match[2]),
    pageId: match[3],
    blockId: match[4],
  });
  return parsed.success ? parsed.data : null;
}

export const resolveRulebookAnnotatedIllustrationRequestSchema = rulebookAnnotatedIllustrationIdentitySchema.extend({
  schemaVersion: z.literal(1),
});

/** The endpoint carries only fields used by the illustration; prose remains in the saved HTML legend. */
export const rulebookIllustrationConfigurationSchema = assetExplainerBlockSchema
  .pick({
    source: true,
    numbering: true,
    colorMode: true,
  })
  .extend({
    items: z.array(assetExplainerBlockSchema.shape.itemsById.valueType.omit({ text: true })).max(128),
  })
  .refine((value) => JSON.stringify(value).length <= 65_536, 'Annotation configuration is too large');

const rulebookIllustrationSourceSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('unavailable') }),
  z.strictObject({ status: z.literal('pending') }),
  z.strictObject({ status: z.literal('board'), boardId: z.string().min(1).max(80) }),
  z.strictObject({
    status: z.literal('stock'),
    reference: rulebookSourceReferenceSchema,
    name: z.string().max(1000),
    artworkId: z.string().min(1).max(256),
  }),
  z.strictObject({
    status: z.literal('image'),
    reference: rulebookSourceReferenceSchema,
    name: z.string().max(1000),
    assetType: z.literal('deck'),
    assetId: z.string().min(1).max(160),
    revision: z.uuid(),
  }),
  z.strictObject({
    status: z.literal('published'),
    reference: rulebookSourceReferenceSchema,
    name: z.string().max(1000),
    assetType: z.enum(COMPONENT_ASSET_TYPES),
    assetId: z.string().min(1).max(160),
    revision: z.uuid(),
    publishedAt: z.number().finite(),
  }),
]);

export const resolveRulebookAnnotatedIllustrationResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ ok: z.literal(true), status: z.literal('missing') }),
  z.strictObject({
    ok: z.literal(true),
    status: z.literal('found'),
    design: rulebookDesignSchema,
    configuration: rulebookIllustrationConfigurationSchema,
    source: rulebookIllustrationSourceSchema,
  }),
]);
export type RulebookAnnotatedIllustrationResolution = z.infer<
  typeof resolveRulebookAnnotatedIllustrationResponseSchema
>;

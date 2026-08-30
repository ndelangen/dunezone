import { normalizeFormattedText } from '@shared/formattedText';
import type { NormalizedFormattedText } from '@shared/formattedText';
import { z } from 'zod';

import { rulebookAnchorSchema, rulebookLayoutCatalogue } from './contents';

const renderFormattedTextSchema = z
  .string()
  .refine(
    (value) => {
      const normalized = normalizeFormattedText(value);
      return normalized.ok && normalized.value === value;
    },
    { message: 'Formatted text must be valid and normalized' }
  )
  .transform((value) => value as NormalizedFormattedText);

const renderLocalIdSchema = z.string().min(1);
const renderAssetSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('unselected') }),
  z.strictObject({ status: z.literal('unavailable'), assetId: z.string().min(1) }),
  z.strictObject({
    status: z.literal('ready'),
    assetId: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    imageUrl: z.string().min(1),
  }),
]);

const renderBlockBase = {
  id: renderLocalIdSchema,
  anchor: rulebookAnchorSchema.optional(),
};

const renderBlockSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...renderBlockBase,
    kind: z.literal('text'),
    text: renderFormattedTextSchema,
  }),
  z.strictObject({
    ...renderBlockBase,
    kind: z.literal('repeated-text'),
    items: z.array(z.strictObject({ id: renderLocalIdSchema, text: renderFormattedTextSchema })),
  }),
  z.strictObject({
    ...renderBlockBase,
    kind: z.literal('rule-group'),
    title: z.string(),
    text: renderFormattedTextSchema,
  }),
  z.strictObject({
    ...renderBlockBase,
    kind: z.literal('asset-figure'),
    asset: renderAssetSchema,
    text: renderFormattedTextSchema,
  }),
]);

const renderRegionSchema = z.strictObject({
  key: z.string().min(1),
  blocks: z.array(renderBlockSchema),
});

const renderControlValueSchema = z.union([
  z.string(),
  z.strictObject({ eyebrow: z.string(), introduction: renderFormattedTextSchema }),
]);

const renderPageSchema = z.strictObject({
  id: renderLocalIdSchema,
  anchor: rulebookAnchorSchema,
  title: z.string(),
  layoutId: z.enum(rulebookLayoutCatalogue.map(({ id }) => id)),
  controlValues: z.record(z.string(), renderControlValueSchema),
  regions: z.array(renderRegionSchema),
});

const rulebookRenderDocumentV1BaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pageOrder: z.array(renderLocalIdSchema),
  pagesById: z.record(renderLocalIdSchema, renderPageSchema),
});

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

/** The serializable input accepted by every published Rulebook renderer. */
export const rulebookRenderDocumentV1Schema = rulebookRenderDocumentV1BaseSchema.superRefine((document, context) => {
  const pageIds = Object.keys(document.pagesById);
  const orderedPageIds = new Set(document.pageOrder);
  if (
    orderedPageIds.size !== document.pageOrder.length ||
    pageIds.length !== document.pageOrder.length ||
    pageIds.some((pageId) => !orderedPageIds.has(pageId))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['pageOrder'],
      message: 'Every rendered Page must appear exactly once in pageOrder',
    });
  }

  const anchors: string[] = [];
  for (const [pageId, page] of Object.entries(document.pagesById)) {
    if (page.id !== pageId) {
      context.addIssue({
        code: 'custom',
        path: ['pagesById', pageId, 'id'],
        message: 'Rendered Page map key and ID must agree',
      });
    }
    anchors.push(page.anchor);
    const layout = rulebookLayoutCatalogue.find(({ id }) => id === page.layoutId)!;
    const expectedRegionKeys = layout.regions.filter((region) => region.kind === 'block').map((region) => region.key);
    const expectedControlKeys = layout.regions
      .filter((region) => region.kind === 'control')
      .map((region) => region.key);
    const controlKeys = Object.keys(page.controlValues);
    if (
      controlKeys.length !== expectedControlKeys.length ||
      expectedControlKeys.some((key) => !controlKeys.includes(key))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['pagesById', pageId, 'controlValues'],
        message: `Rendered controls must follow the ${page.layoutId} layout`,
      });
    }
    for (const region of layout.regions) {
      if (region.kind !== 'control') {
        continue;
      }
      const parsed = region.valueSchema.safeParse(page.controlValues[region.key]);
      if (!parsed.success) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', pageId, 'controlValues', region.key],
          message: `Rendered control ${region.key} must follow the ${page.layoutId} layout`,
        });
      }
    }
    if (
      page.regions.length !== expectedRegionKeys.length ||
      page.regions.some((region, index) => region.key !== expectedRegionKeys[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['pagesById', pageId, 'regions'],
        message: `Rendered regions must follow the ${page.layoutId} layout`,
      });
    }

    const blockIds: string[] = [];
    for (const [regionIndex, region] of page.regions.entries()) {
      const definition = layout.regions.find(
        (candidate): candidate is Extract<(typeof layout.regions)[number], { kind: 'block' }> =>
          candidate.kind === 'block' && candidate.key === region.key
      );
      if (definition && region.blocks.length < definition.cardinality.minimum) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', pageId, 'regions', regionIndex, 'blocks'],
          message: `Rendered region ${region.key} requires at least ${definition.cardinality.minimum} Blocks`,
        });
      }
      if (
        definition?.cardinality.maximum !== null &&
        definition?.cardinality.maximum !== undefined &&
        region.blocks.length > definition.cardinality.maximum
      ) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', pageId, 'regions', regionIndex, 'blocks'],
          message: `Rendered region ${region.key} accepts at most ${definition.cardinality.maximum} Blocks`,
        });
      }
      for (const [blockIndex, block] of region.blocks.entries()) {
        blockIds.push(block.id);
        if (!definition?.acceptedBlockKinds.some((kind) => kind === block.kind)) {
          context.addIssue({
            code: 'custom',
            path: ['pagesById', pageId, 'regions', regionIndex, 'blocks', blockIndex, 'kind'],
            message: `${block.kind} cannot render in ${region.key}`,
          });
        }
        if (block.anchor) {
          anchors.push(block.anchor);
        }
        if (block.kind === 'repeated-text') {
          for (const itemId of duplicateValues(block.items.map(({ id }) => id))) {
            context.addIssue({
              code: 'custom',
              path: ['pagesById', pageId, 'regions', regionIndex, 'blocks', blockIndex, 'items'],
              message: `Rendered repeated item ${itemId} appears more than once`,
            });
          }
        }
      }
    }
    for (const blockId of duplicateValues(blockIds)) {
      context.addIssue({
        code: 'custom',
        path: ['pagesById', pageId, 'regions'],
        message: `Rendered Block ${blockId} appears more than once on Page ${pageId}`,
      });
    }
  }

  for (const anchor of duplicateValues(anchors)) {
    context.addIssue({
      code: 'custom',
      path: ['pagesById'],
      message: `Rendered anchor ${anchor} appears more than once`,
    });
  }
});

export type RulebookRenderDocumentV1 = z.infer<typeof rulebookRenderDocumentV1Schema>;

type EditableValue<Value> = Value extends NormalizedFormattedText
  ? string
  : Value extends readonly (infer Item)[]
    ? EditableValue<Item>[]
    : Value extends object
      ? { [Key in keyof Value]: EditableValue<Value[Key]> }
      : Value;

/** The same render shape with raw text admitted only for a browser-local editor preview. */
export type RulebookRenderPreviewDocumentV1 = EditableValue<RulebookRenderDocumentV1>;
export type RulebookRenderPageV1 = RulebookRenderPreviewDocumentV1['pagesById'][string];
export type RulebookRenderBlockV1 = RulebookRenderPageV1['regions'][number]['blocks'][number];
export type RulebookRenderAssetV1 = Extract<RulebookRenderBlockV1, { kind: 'asset-figure' }>['asset'];

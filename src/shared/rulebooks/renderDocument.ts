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

type RenderDocumentInput = z.infer<typeof rulebookRenderDocumentV1BaseSchema>;
type RenderPageInput = RenderDocumentInput['pagesById'][string];
type RenderRegionInput = RenderPageInput['regions'][number];
type RenderBlockInput = RenderRegionInput['blocks'][number];
type RulebookLayout = (typeof rulebookLayoutCatalogue)[number];
type RulebookBlockRegion = Extract<RulebookLayout['regions'][number], { kind: 'block' }>;

function addIssue(context: z.RefinementCtx, path: (string | number)[], message: string) {
  context.addIssue({ code: 'custom', path, message });
}

function validatePageOrder(document: RenderDocumentInput, context: z.RefinementCtx) {
  const pageIds = Object.keys(document.pagesById);
  const orderedPageIds = new Set(document.pageOrder);
  const orderIsInvalid =
    orderedPageIds.size !== document.pageOrder.length ||
    pageIds.length !== document.pageOrder.length ||
    pageIds.some((pageId) => !orderedPageIds.has(pageId));
  if (orderIsInvalid) {
    addIssue(context, ['pageOrder'], 'Every rendered Page must appear exactly once in pageOrder');
  }
}

function validateControlValues(
  pageId: string,
  page: RenderPageInput,
  layout: RulebookLayout,
  context: z.RefinementCtx
) {
  const definitions = layout.regions.filter((region) => region.kind === 'control');
  const controlKeys = Object.keys(page.controlValues);
  if (controlKeys.length !== definitions.length || definitions.some(({ key }) => !controlKeys.includes(key))) {
    addIssue(
      context,
      ['pagesById', pageId, 'controlValues'],
      `Rendered controls must follow the ${page.layoutId} layout`
    );
  }
  for (const definition of definitions) {
    if (!definition.valueSchema.safeParse(page.controlValues[definition.key]).success) {
      addIssue(
        context,
        ['pagesById', pageId, 'controlValues', definition.key],
        `Rendered control ${definition.key} must follow the ${page.layoutId} layout`
      );
    }
  }
}

function blockRegion(layout: RulebookLayout, regionKey: string): RulebookBlockRegion | undefined {
  return layout.regions.find(
    (candidate): candidate is RulebookBlockRegion => candidate.kind === 'block' && candidate.key === regionKey
  );
}

function validateRegionOrder(pageId: string, page: RenderPageInput, layout: RulebookLayout, context: z.RefinementCtx) {
  const expectedKeys = layout.regions.filter((region) => region.kind === 'block').map(({ key }) => key);
  const orderMatches =
    page.regions.length === expectedKeys.length &&
    page.regions.every((region, index) => region.key === expectedKeys[index]);
  if (!orderMatches) {
    addIssue(context, ['pagesById', pageId, 'regions'], `Rendered regions must follow the ${page.layoutId} layout`);
  }
}

function validateRegionCardinality(
  pageId: string,
  regionIndex: number,
  region: RenderRegionInput,
  definition: RulebookBlockRegion | undefined,
  context: z.RefinementCtx
) {
  if (definition && region.blocks.length < definition.cardinality.minimum) {
    addIssue(
      context,
      ['pagesById', pageId, 'regions', regionIndex, 'blocks'],
      `Rendered region ${region.key} requires at least ${definition.cardinality.minimum} Blocks`
    );
  }
  const maximum = definition?.cardinality.maximum;
  if (maximum !== null && maximum !== undefined && region.blocks.length > maximum) {
    addIssue(
      context,
      ['pagesById', pageId, 'regions', regionIndex, 'blocks'],
      `Rendered region ${region.key} accepts at most ${maximum} Blocks`
    );
  }
}

function validateBlock(
  pageId: string,
  regionIndex: number,
  blockIndex: number,
  region: RenderRegionInput,
  block: RenderBlockInput,
  definition: RulebookBlockRegion | undefined,
  anchors: string[],
  context: z.RefinementCtx
) {
  if (!definition?.acceptedBlockKinds.some((kind) => kind === block.kind)) {
    addIssue(
      context,
      ['pagesById', pageId, 'regions', regionIndex, 'blocks', blockIndex, 'kind'],
      `${block.kind} cannot render in ${region.key}`
    );
  }
  if (block.anchor) {
    anchors.push(block.anchor);
  }
  if (block.kind !== 'repeated-text') {
    return;
  }
  for (const itemId of duplicateValues(block.items.map(({ id }) => id))) {
    addIssue(
      context,
      ['pagesById', pageId, 'regions', regionIndex, 'blocks', blockIndex, 'items'],
      `Rendered repeated item ${itemId} appears more than once`
    );
  }
}

function validateRegion(
  pageId: string,
  regionIndex: number,
  region: RenderRegionInput,
  layout: RulebookLayout,
  blockIds: string[],
  anchors: string[],
  context: z.RefinementCtx
) {
  const definition = blockRegion(layout, region.key);
  validateRegionCardinality(pageId, regionIndex, region, definition, context);
  for (const [blockIndex, block] of region.blocks.entries()) {
    blockIds.push(block.id);
    validateBlock(pageId, regionIndex, blockIndex, region, block, definition, anchors, context);
  }
}

function validatePage(pageId: string, page: RenderPageInput, anchors: string[], context: z.RefinementCtx) {
  if (page.id !== pageId) {
    addIssue(context, ['pagesById', pageId, 'id'], 'Rendered Page map key and ID must agree');
  }
  anchors.push(page.anchor);
  const layout = rulebookLayoutCatalogue.find(({ id }) => id === page.layoutId)!;
  validateControlValues(pageId, page, layout, context);
  validateRegionOrder(pageId, page, layout, context);

  const blockIds: string[] = [];
  for (const [regionIndex, region] of page.regions.entries()) {
    validateRegion(pageId, regionIndex, region, layout, blockIds, anchors, context);
  }
  for (const blockId of duplicateValues(blockIds)) {
    addIssue(
      context,
      ['pagesById', pageId, 'regions'],
      `Rendered Block ${blockId} appears more than once on Page ${pageId}`
    );
  }
}

function validateRenderDocument(document: RenderDocumentInput, context: z.RefinementCtx) {
  validatePageOrder(document, context);
  const anchors: string[] = [];
  for (const [pageId, page] of Object.entries(document.pagesById)) {
    validatePage(pageId, page, anchors, context);
  }
  for (const anchor of duplicateValues(anchors)) {
    addIssue(context, ['pagesById'], `Rendered anchor ${anchor} appears more than once`);
  }
}

/** The serializable input accepted by every published Rulebook renderer. */
export const rulebookRenderDocumentV1Schema = rulebookRenderDocumentV1BaseSchema.superRefine(validateRenderDocument);

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

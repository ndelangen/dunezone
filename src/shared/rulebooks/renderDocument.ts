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
type ValidationReporter = Readonly<{ refinement: z.RefinementCtx }>;
type PageValidation = ValidationReporter & {
  pageId: string;
  anchors: string[];
};
type RegionValidation = PageValidation & {
  regionIndex: number;
  region: RenderRegionInput;
  definition: RulebookBlockRegion | undefined;
  blockIds: string[];
};

function addIssue({ refinement }: ValidationReporter, issue: Readonly<{ path: (string | number)[]; message: string }>) {
  refinement.addIssue({ code: 'custom', ...issue });
}

function validatePageOrder(document: RenderDocumentInput, reporter: ValidationReporter) {
  const pageIds = Object.keys(document.pagesById);
  const orderedPageIds = new Set(document.pageOrder);
  const orderIsInvalid =
    orderedPageIds.size !== document.pageOrder.length ||
    pageIds.length !== document.pageOrder.length ||
    pageIds.some((pageId) => !orderedPageIds.has(pageId));
  if (orderIsInvalid) {
    addIssue(reporter, {
      path: ['pageOrder'],
      message: 'Every rendered Page must appear exactly once in pageOrder',
    });
  }
}

function validateControlValues(page: RenderPageInput, layout: RulebookLayout, validation: PageValidation) {
  const definitions = layout.regions.filter((region) => region.kind === 'control');
  const controlKeys = Object.keys(page.controlValues);
  if (controlKeys.length !== definitions.length || definitions.some(({ key }) => !controlKeys.includes(key))) {
    addIssue(validation, {
      path: ['pagesById', validation.pageId, 'controlValues'],
      message: `Rendered controls must follow the ${page.layoutId} layout`,
    });
  }
  for (const definition of definitions) {
    if (!definition.valueSchema.safeParse(page.controlValues[definition.key]).success) {
      addIssue(validation, {
        path: ['pagesById', validation.pageId, 'controlValues', definition.key],
        message: `Rendered control ${definition.key} must follow the ${page.layoutId} layout`,
      });
    }
  }
}

function blockRegion(layout: RulebookLayout, region: RenderRegionInput): RulebookBlockRegion | undefined {
  return layout.regions.find(
    (candidate): candidate is RulebookBlockRegion => candidate.kind === 'block' && candidate.key === region.key
  );
}

function validateRegionOrder(page: RenderPageInput, layout: RulebookLayout, validation: PageValidation) {
  const expectedKeys = layout.regions.filter((region) => region.kind === 'block').map(({ key }) => key);
  const orderMatches =
    page.regions.length === expectedKeys.length &&
    page.regions.every((region, index) => region.key === expectedKeys[index]);
  if (!orderMatches) {
    addIssue(validation, {
      path: ['pagesById', validation.pageId, 'regions'],
      message: `Rendered regions must follow the ${page.layoutId} layout`,
    });
  }
}

function validateRegionCardinality(validation: RegionValidation) {
  const { definition, region } = validation;
  if (definition && region.blocks.length < definition.cardinality.minimum) {
    addIssue(validation, {
      path: ['pagesById', validation.pageId, 'regions', validation.regionIndex, 'blocks'],
      message: `Rendered region ${region.key} requires at least ${definition.cardinality.minimum} Blocks`,
    });
  }
  const maximum = definition?.cardinality.maximum;
  if (maximum === null || maximum === undefined) {
    return;
  }
  if (region.blocks.length <= maximum) {
    return;
  }
  addIssue(validation, {
    path: ['pagesById', validation.pageId, 'regions', validation.regionIndex, 'blocks'],
    message: `Rendered region ${region.key} accepts at most ${maximum} Blocks`,
  });
}

function validateBlock(block: RenderBlockInput, blockIndex: number, validation: RegionValidation) {
  if (!validation.definition?.acceptedBlockKinds.some((kind) => kind === block.kind)) {
    addIssue(validation, {
      path: ['pagesById', validation.pageId, 'regions', validation.regionIndex, 'blocks', blockIndex, 'kind'],
      message: `${block.kind} cannot render in ${validation.region.key}`,
    });
  }
  if (block.anchor) {
    validation.anchors.push(block.anchor);
  }
  if (block.kind !== 'repeated-text') {
    return;
  }
  for (const itemId of duplicateValues(block.items.map(({ id }) => id))) {
    addIssue(validation, {
      path: ['pagesById', validation.pageId, 'regions', validation.regionIndex, 'blocks', blockIndex, 'items'],
      message: `Rendered repeated item ${itemId} appears more than once`,
    });
  }
}

function validateRegion(validation: RegionValidation) {
  validateRegionCardinality(validation);
  for (const [blockIndex, block] of validation.region.blocks.entries()) {
    validation.blockIds.push(block.id);
    validateBlock(block, blockIndex, validation);
  }
}

function validatePage(page: RenderPageInput, validation: PageValidation) {
  if (page.id !== validation.pageId) {
    addIssue(validation, {
      path: ['pagesById', validation.pageId, 'id'],
      message: 'Rendered Page map key and ID must agree',
    });
  }
  validation.anchors.push(page.anchor);
  const layout = rulebookLayoutCatalogue.find(({ id }) => id === page.layoutId)!;
  validateControlValues(page, layout, validation);
  validateRegionOrder(page, layout, validation);

  const blockIds: string[] = [];
  for (const [regionIndex, region] of page.regions.entries()) {
    validateRegion({
      ...validation,
      region,
      regionIndex,
      definition: blockRegion(layout, region),
      blockIds,
    });
  }
  for (const blockId of duplicateValues(blockIds)) {
    addIssue(validation, {
      path: ['pagesById', validation.pageId, 'regions'],
      message: `Rendered Block ${blockId} appears more than once on Page ${validation.pageId}`,
    });
  }
}

function validateRenderDocument(document: RenderDocumentInput, refinement: z.RefinementCtx) {
  const reporter = { refinement };
  validatePageOrder(document, reporter);
  const anchors: string[] = [];
  for (const [pageId, page] of Object.entries(document.pagesById)) {
    validatePage(page, { ...reporter, pageId, anchors });
  }
  for (const anchor of duplicateValues(anchors)) {
    addIssue(reporter, {
      path: ['pagesById'],
      message: `Rendered anchor ${anchor} appears more than once`,
    });
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

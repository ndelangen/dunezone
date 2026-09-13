import { z } from 'zod';

import { parseFormattedText } from '../formattedText';
import type { NormalizedFormattedText } from '../formattedText';
import {
  assetExplainerBlockSchema,
  assetExplainerItemSchema,
  rulebookAnchorSchema,
  rulebookLayoutCatalogue,
  rulebookPageV1Schema,
} from './contents';
import type { RulebookBlockKind, RulebookBlockRegionDefinition, RulebookPageV1 } from './contents';
import { rulebookCoverImageSchema } from './coverImage';
import { rulebookResolvedFactionSchema } from './references';
import { DEFAULT_RULEBOOK_SETTINGS, rulebookSettingsSchema } from './settings';
import { rulebookResolvedSourceSchema } from './sources';

const renderFormattedTextSchema = z
  .string()
  .refine((value) => parseFormattedText(value).valid, { message: 'Formatted text must be valid and renderable' })
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

const renderFactionSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('unselected') }),
  z.strictObject({ status: z.literal('unavailable'), factionId: z.string().min(1) }),
  rulebookResolvedFactionSchema.extend({ status: z.literal('ready'), factionId: z.string().min(1) }),
]);
const renderCoverControlSchema = z.strictObject({
  artwork: renderAssetSchema,
  backgroundImageUrl: z.string().optional(),
  backgroundImage: rulebookCoverImageSchema.omit({ sourceUrl: true }).optional(),
  showDuneLogo: z.boolean().optional(),
  showSubtitle: z.boolean().optional(),
  subtitle: z.string(),
  supportingText: z.string(),
});

const renderBlockBase = {
  id: renderLocalIdSchema,
  anchor: rulebookAnchorSchema.optional(),
};

const renderCardGuideFields = {
  source: rulebookResolvedSourceSchema,
  text: renderFormattedTextSchema,
  quantity: z.number().int().nonnegative().optional(),
};

const renderBlockSchemas = {
  text: z.strictObject({
    ...renderBlockBase,
    kind: z.literal('text'),
    name: z.string().optional(),
    text: renderFormattedTextSchema,
  }),
  'repeated-text': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('repeated-text'),
    items: z.array(z.strictObject({ id: renderLocalIdSchema, text: renderFormattedTextSchema })),
  }),
  'rule-group': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('rule-group'),
    title: z.string(),
    text: renderFormattedTextSchema,
  }),
  'asset-figure': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('asset-figure'),
    asset: renderAssetSchema,
    text: renderFormattedTextSchema,
  }),
  'section-heading': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('section-heading'),
    title: z.string(),
    faction: renderFactionSchema,
  }),
  list: z.strictObject({
    ...renderBlockBase,
    kind: z.literal('list'),
    style: z.enum(['bulleted', 'numbered']),
    items: z.array(
      z.strictObject({ id: renderLocalIdSchema, name: z.string().optional(), text: renderFormattedTextSchema })
    ),
  }),
  callout: z.strictObject({
    ...renderBlockBase,
    kind: z.literal('callout'),
    variant: z.enum(['note', 'example', 'quotation']),
    title: z.string().optional(),
    text: renderFormattedTextSchema,
    attribution: z.string().optional(),
  }),
  'referenced-illustration': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('referenced-illustration'),
    source: rulebookResolvedSourceSchema,
    caption: z.string(),
  }),
  'illustrated-inventory': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('illustrated-inventory'),
    title: z.string().optional(),
    introduction: renderFormattedTextSchema,
    items: z.array(
      z.strictObject({
        id: renderLocalIdSchema,
        source: rulebookResolvedSourceSchema,
        text: renderFormattedTextSchema,
        quantity: z.number().int().nonnegative().optional(),
        caption: z.string().optional(),
      })
    ),
  }),
  'faction-introduction': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('faction-introduction'),
    faction: renderFactionSchema,
    text: renderFormattedTextSchema,
  }),
  'card-entry': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('card-entry'),
    ...renderCardGuideFields,
  }),
  'card-group': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('card-group'),
    title: z.string(),
    text: renderFormattedTextSchema,
    variant: z.enum(['compact', 'gallery', 'featured-member']),
    featuredItemId: renderLocalIdSchema.optional(),
    items: z.array(z.strictObject({ id: renderLocalIdSchema, ...renderCardGuideFields })),
  }),
  'asset-explainer': assetExplainerBlockSchema.omit({ itemsById: true, itemOrder: true }).extend({
    ...renderBlockBase,
    source: rulebookResolvedSourceSchema,
    illustrationUrl: z.string().min(1).optional(),
    items: z.array(assetExplainerItemSchema.extend({ text: renderFormattedTextSchema })),
  }),
  'question-answer': z.strictObject({
    ...renderBlockBase,
    kind: z.literal('question-answer'),
    topic: z.string().optional(),
    question: renderFormattedTextSchema,
    answer: renderFormattedTextSchema,
  }),
} satisfies Record<RulebookBlockKind, z.ZodType>;

const renderBlockSchema = z.discriminatedUnion('kind', [
  renderBlockSchemas.text,
  renderBlockSchemas['repeated-text'],
  renderBlockSchemas['rule-group'],
  renderBlockSchemas['asset-figure'],
  renderBlockSchemas['section-heading'],
  renderBlockSchemas.list,
  renderBlockSchemas.callout,
  renderBlockSchemas['question-answer'],
  renderBlockSchemas['referenced-illustration'],
  renderBlockSchemas['illustrated-inventory'],
  renderBlockSchemas['faction-introduction'],
  renderBlockSchemas['card-entry'],
  renderBlockSchemas['card-group'],
  renderBlockSchemas['asset-explainer'],
]);

type RenderBlock = z.output<typeof renderBlockSchema>;
type RulebookLayout = (typeof rulebookLayoutCatalogue)[number];
type RenderControlValues<Layout extends RulebookLayout> = Layout['id'] extends 'cover'
  ? { cover: z.output<typeof renderCoverControlSchema> }
  : Extract<RulebookPageV1, { layoutId: Layout['id'] }>['controlValues'];
type RenderRegion<Definition extends RulebookBlockRegionDefinition> = {
  key: Definition['key'];
  blocks: Array<Extract<RenderBlock, { kind: Definition['acceptedBlockKinds'][number] }>>;
};
type RenderRegions<Regions extends readonly unknown[]> = Regions extends readonly [infer Region, ...infer Rest]
  ? Region extends RulebookBlockRegionDefinition
    ? [RenderRegion<Region>, ...RenderRegions<Rest>]
    : RenderRegions<Rest>
  : [];
type RenderPage<Layout extends RulebookLayout = RulebookLayout> = Layout extends RulebookLayout
  ? {
      id: string;
      anchor: string;
      title: string;
      layoutId: Layout['id'];
      controlValues: RenderControlValues<Layout>;
      regions: RenderRegions<Layout['regions']>;
    } & (Layout extends { supportedSizes: readonly string[] } ? { showHeading: boolean } : {})
  : never;

type EditableValue<Value> = Value extends NormalizedFormattedText
  ? string
  : Value extends readonly []
    ? []
    : Value extends readonly [infer First, ...infer Rest]
      ? [EditableValue<First>, ...EditableValue<Rest>]
      : Value extends readonly (infer Item)[]
        ? EditableValue<Item>[]
        : Value extends object
          ? { [Key in keyof Value]: EditableValue<Value[Key]> }
          : Value;

function acceptedRenderBlockSchema(acceptedKinds: readonly RulebookBlockKind[]) {
  const schemas = acceptedKinds.map((kind) => renderBlockSchemas[kind]);
  const [first, second, ...rest] = schemas;
  if (!first) {
    throw new Error('A Rulebook Block region must accept at least one Block kind');
  }
  return second ? z.union([first, second, ...rest]) : first;
}

function renderRegionSchema<const Definition extends RulebookBlockRegionDefinition>(definition: Definition) {
  let blocks = z.array(acceptedRenderBlockSchema(definition.acceptedBlockKinds)).min(definition.cardinality.minimum);
  if (definition.cardinality.maximum !== null) {
    blocks = blocks.max(definition.cardinality.maximum);
  }
  return z.strictObject({ key: z.literal(definition.key), blocks }) as unknown as z.ZodType<
    RenderRegion<Definition>,
    EditableValue<RenderRegion<Definition>>
  >;
}

function renderControlValuesSchema<const Layout extends RulebookLayout>(layout: Layout) {
  if (layout.id === 'cover') {
    return z.strictObject({ cover: renderCoverControlSchema }) as unknown as z.ZodType<
      RenderControlValues<Layout>,
      EditableValue<RenderControlValues<Layout>>
    >;
  }
  if (layout.id === 'wide-narrow' || layout.id === 'band-columns') {
    return rulebookPageV1Schema.options.find((page) => page.shape.layoutId.value === layout.id)!.shape
      .controlValues as unknown as z.ZodType<RenderControlValues<Layout>, EditableValue<RenderControlValues<Layout>>>;
  }
  const shape = Object.fromEntries(
    /* The render document proves what is stored, so it reads a Control value with the catalogue's render schema; `valueSchema` is the write contract and re-tightens a stored Edition (#1033). */
    layout.regions.flatMap((region) => (region.kind === 'control' ? [[region.key, region.renderValueSchema]] : []))
  ) as Record<string, z.ZodType>;
  return z.strictObject(shape) as unknown as z.ZodType<
    RenderControlValues<Layout>,
    EditableValue<RenderControlValues<Layout>>
  >;
}

function renderRegionsSchema<const Layout extends RulebookLayout>(layout: Layout) {
  const schemas = layout.regions.flatMap((region) => (region.kind === 'block' ? [renderRegionSchema(region)] : []));
  if (schemas.length === 0) {
    return z.tuple([]) as unknown as z.ZodType<
      RenderRegions<Layout['regions']>,
      EditableValue<RenderRegions<Layout['regions']>>
    >;
  }
  return z.tuple(schemas as [z.ZodType, ...z.ZodType[]]) as unknown as z.ZodType<
    RenderRegions<Layout['regions']>,
    EditableValue<RenderRegions<Layout['regions']>>
  >;
}

function renderPageSchema<const Layout extends RulebookLayout>(layout: Layout) {
  return z.strictObject({
    id: renderLocalIdSchema,
    anchor: rulebookAnchorSchema,
    title: z.string(),
    ...('supportedSizes' in layout ? { showHeading: z.boolean().default(true) } : {}),
    layoutId: z.literal(layout.id),
    controlValues: renderControlValuesSchema(layout),
    regions: renderRegionsSchema(layout),
  });
}

const renderPageSchemas = rulebookLayoutCatalogue.map(renderPageSchema) as [
  ReturnType<typeof renderPageSchema>,
  ...ReturnType<typeof renderPageSchema>[],
];
export const rulebookRenderPageV1Schema = z.discriminatedUnion('layoutId', renderPageSchemas) as z.ZodType<
  RenderPage,
  EditableValue<RenderPage>
>;

const rulebookRenderDocumentV1BaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  settings: rulebookSettingsSchema.default(DEFAULT_RULEBOOK_SETTINGS),
  pageOrder: z.array(renderLocalIdSchema),
  pagesById: z.record(renderLocalIdSchema, rulebookRenderPageV1Schema),
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
type ValidationReporter = Readonly<{ refinement: z.RefinementCtx }>;
type PageValidation = ValidationReporter & {
  pageId: string;
  anchors: string[];
};
type RegionValidation = PageValidation & {
  regionIndex: number;
  region: RenderRegionInput;
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

function validateBlock(block: RenderBlockInput, blockIndex: number, validation: RegionValidation) {
  if (block.anchor) {
    validation.anchors.push(block.anchor);
  }
  if (
    block.kind !== 'repeated-text' &&
    block.kind !== 'list' &&
    block.kind !== 'illustrated-inventory' &&
    block.kind !== 'card-group' &&
    block.kind !== 'asset-explainer'
  ) {
    return;
  }
  if (
    block.kind === 'card-group' &&
    block.featuredItemId &&
    !block.items.some(({ id }) => id === block.featuredItemId)
  ) {
    addIssue(validation, {
      path: ['pagesById', validation.pageId, 'regions', validation.regionIndex, 'blocks', blockIndex, 'featuredItemId'],
      message: 'The featured Card must belong to this rendered group',
    });
  }
  for (const itemId of duplicateValues(block.items.map(({ id }) => id))) {
    addIssue(validation, {
      path: ['pagesById', validation.pageId, 'regions', validation.regionIndex, 'blocks', blockIndex, 'items'],
      message: `Rendered repeated item ${itemId} appears more than once`,
    });
  }
}

function validateRegion(validation: RegionValidation) {
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

  const blockIds: string[] = [];
  for (const [regionIndex, region] of page.regions.entries()) {
    validateRegion({
      ...validation,
      region,
      regionIndex,
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

/** The same render shape with raw text admitted only for a browser-local editor preview. */
export type RulebookRenderPreviewDocumentV1 = EditableValue<RulebookRenderDocumentV1>;
export type RulebookRenderPageV1 = RulebookRenderPreviewDocumentV1['pagesById'][string];
export type RulebookRenderPageByLayoutV1<LayoutId extends RulebookRenderPageV1['layoutId']> = Extract<
  RulebookRenderPageV1,
  { layoutId: LayoutId }
>;
export type RulebookRenderBlockV1 = RulebookRenderPageV1['regions'][number]['blocks'][number];
export type RulebookRenderAssetV1 = Extract<RulebookRenderBlockV1, { kind: 'asset-figure' }>['asset'];

export type RulebookRenderFactionV1 = z.output<typeof renderFactionSchema>;

export type RulebookRenderSourceV1 = z.output<typeof rulebookResolvedSourceSchema>;

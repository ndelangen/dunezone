import { z } from 'zod';

import { normalizeFormattedText } from '../formattedText';
import type { NormalizedFormattedText } from '../formattedText';
import { rulebookAnchorSchema, rulebookLayoutCatalogue } from './contents';
import type { RulebookBlockKind, RulebookBlockRegionDefinition } from './contents';

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

const renderBlockSchemas = {
  text: z.strictObject({
    ...renderBlockBase,
    kind: z.literal('text'),
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
} satisfies Record<RulebookBlockKind, z.ZodType>;

const renderBlockSchema = z.discriminatedUnion('kind', [
  renderBlockSchemas.text,
  renderBlockSchemas['repeated-text'],
  renderBlockSchemas['rule-group'],
  renderBlockSchemas['asset-figure'],
]);

type RenderBlock = z.output<typeof renderBlockSchema>;
type RulebookLayout = (typeof rulebookLayoutCatalogue)[number];
type RulebookControlRegion<Layout extends RulebookLayout> = Extract<Layout['regions'][number], { kind: 'control' }>;
type RenderControlValues<Layout extends RulebookLayout> = {
  [Region in RulebookControlRegion<Layout> as Region['key']]: z.output<Region['valueSchema']>;
};
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
    }
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
  const shape = Object.fromEntries(
    layout.regions.flatMap((region) => (region.kind === 'control' ? [[region.key, region.valueSchema]] : []))
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

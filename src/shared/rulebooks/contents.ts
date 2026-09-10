import { z } from 'zod';

import { normalizeFormattedText, parseFormattedText } from '../formattedText';
import type { NormalizedFormattedText } from '../formattedText';
import type { RulebookSize } from './settings';
import { rulebookCardSourceReferenceSchema, rulebookSourceReferenceSchema } from './sources';

/** Creation callers declare the catalogue they can read before receiving starter or cloned Contents. */
export const RULEBOOK_CATALOGUE_VERSION = 4;

export const rulebookLocalIdAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' as const;
const rulebookLocalIdPattern = new RegExp(`^[${rulebookLocalIdAlphabet}]{4}$`);

export const rulebookLocalIdSchema = z
  .string()
  .length(4, 'Use a four-character ID')
  .regex(rulebookLocalIdPattern, 'Use the unambiguous Rulebook ID alphabet');
type RandomBytes = () => Uint8Array;
const secureRandomBytes: RandomBytes = () => crypto.getRandomValues(new Uint8Array(4));

/** Issues one opaque local ID, retrying collisions within the caller-owned identity scope. */
export function createRulebookLocalId(existingIds: Iterable<string>, randomBytes: RandomBytes = secureRandomBytes) {
  const existing = new Set(existingIds);
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const bytes = randomBytes();
    if (bytes.length < 4) {
      throw new Error('Rulebook ID randomness must provide four bytes');
    }
    const id = Array.from(bytes.slice(0, 4), (byte) => rulebookLocalIdAlphabet[byte & 31]).join('');
    if (!existing.has(id)) {
      return id;
    }
  }
  throw new Error('Could not issue a unique Rulebook ID');
}

export const rulebookFinalBlockKinds = [
  'section-heading',
  'text',
  'list',
  'callout',
  'question-answer',
  'referenced-illustration',
  'illustrated-inventory',
  'faction-introduction',
  'card-entry',
  'card-group',
  'asset-explainer',
] as const;
export const rulebookBlockKinds = [...rulebookFinalBlockKinds, 'repeated-text', 'rule-group', 'asset-figure'] as const;
export type RulebookBlockKind = (typeof rulebookBlockKinds)[number];

const normalizedFormattedTextSchema = z
  .string()
  .refine(
    (value) => {
      const normalized = normalizeFormattedText(value);
      return normalized.ok && normalized.value === value;
    },
    { message: 'Formatted text must be valid and normalized' }
  )
  .transform((value) => value as NormalizedFormattedText);

/*
 * What a stored Edition is read with, and what its render document is proved against.
 * A published Edition keeps the contract that minted it, so a later canonical spelling only tightens new writes (#1033).
 */
const editionFormattedTextSchema = z
  .string()
  .refine((value) => parseFormattedText(value).valid, {
    message: 'Formatted text must be valid under the Edition contract',
  })
  .transform((value) => value as NormalizedFormattedText);

export const rulebookAnchorSchema = z
  .string()
  .min(1, 'An anchor is required')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens');

export const rulebookItemIdSchema = z.string().min(1);

const textBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('text'),
  name: z.string().optional(),
  anchor: rulebookAnchorSchema.optional(),
  text: normalizedFormattedTextSchema,
});

const repeatedTextItemSchema = z.strictObject({ id: rulebookItemIdSchema, text: normalizedFormattedTextSchema });

const repeatedTextBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('repeated-text'),
  anchor: rulebookAnchorSchema.optional(),
  itemOrder: z.array(rulebookItemIdSchema),
  itemsById: z.record(rulebookItemIdSchema, repeatedTextItemSchema),
});

const ruleGroupBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('rule-group'),
  anchor: rulebookAnchorSchema.optional(),
  title: z.string(),
  text: normalizedFormattedTextSchema,
});

const assetFigureBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('asset-figure'),
  anchor: rulebookAnchorSchema.optional(),
  assetId: z.string().min(1).optional(),
  text: normalizedFormattedTextSchema,
});

const sectionHeadingBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('section-heading'),
  anchor: rulebookAnchorSchema.optional(),
  title: z.string(),
  factionId: z.string().min(1).optional(),
});
const listItemSchema = repeatedTextItemSchema.extend({ name: z.string().optional() });
const listBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('list'),
  anchor: rulebookAnchorSchema.optional(),
  style: z.enum(['bulleted', 'numbered']),
  itemOrder: z.array(rulebookItemIdSchema),
  itemsById: z.record(rulebookItemIdSchema, listItemSchema),
});
const calloutBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('callout'),
  anchor: rulebookAnchorSchema.optional(),
  variant: z.enum(['note', 'example', 'quotation']),
  title: z.string().optional(),
  text: normalizedFormattedTextSchema,
  attribution: z.string().optional(),
});
const questionAnswerBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('question-answer'),
  anchor: rulebookAnchorSchema.optional(),
  topic: z.string().optional(),
  question: normalizedFormattedTextSchema,
  answer: normalizedFormattedTextSchema,
});

const referencedIllustrationBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('referenced-illustration'),
  anchor: rulebookAnchorSchema.optional(),
  source: rulebookSourceReferenceSchema.optional(),
  caption: z.string(),
});
const illustratedInventoryItemSchema = z.strictObject({
  id: rulebookItemIdSchema,
  source: rulebookSourceReferenceSchema.optional(),
  text: normalizedFormattedTextSchema,
  quantity: z.number().int().nonnegative().optional(),
  caption: z.string().optional(),
});
const illustratedInventoryBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('illustrated-inventory'),
  anchor: rulebookAnchorSchema.optional(),
  title: z.string().optional(),
  introduction: normalizedFormattedTextSchema,
  itemOrder: z.array(rulebookItemIdSchema),
  itemsById: z.record(rulebookItemIdSchema, illustratedInventoryItemSchema),
});
const factionIntroductionBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('faction-introduction'),
  anchor: rulebookAnchorSchema.optional(),
  factionId: z.string().min(1).optional(),
  text: normalizedFormattedTextSchema,
});

const cardGuideFields = {
  source: rulebookCardSourceReferenceSchema.optional(),
  text: normalizedFormattedTextSchema,
  quantity: z.number().int().nonnegative().optional(),
};
const cardEntryBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('card-entry'),
  anchor: rulebookAnchorSchema.optional(),
  ...cardGuideFields,
});
const cardGroupItemSchema = z.strictObject({ id: rulebookItemIdSchema, ...cardGuideFields });
const cardGroupBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('card-group'),
  anchor: rulebookAnchorSchema.optional(),
  title: z.string(),
  text: normalizedFormattedTextSchema,
  variant: z.enum(['compact', 'gallery', 'featured-member']),
  featuredItemId: rulebookItemIdSchema.optional(),
  itemOrder: z.array(rulebookItemIdSchema),
  itemsById: z.record(rulebookItemIdSchema, cardGroupItemSchema),
});

/** Targets retain the source identity the author selected, including when the Block source changes. */
export const rulebookAssetExplainerTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('named'),
    key: z.string().max(128),
    source: rulebookSourceReferenceSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('position'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    source: rulebookSourceReferenceSchema.optional(),
  }),
]);
export type RulebookAssetExplainerTarget = z.infer<typeof rulebookAssetExplainerTargetSchema>;
export const rulebookAssetExplainerColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color');
export const assetExplainerItemSchema = z.strictObject({
  id: rulebookItemIdSchema,
  label: z.string().max(32),
  color: rulebookAssetExplainerColorSchema.optional(),
  text: normalizedFormattedTextSchema,
  target: rulebookAssetExplainerTargetSchema,
});
export const assetExplainerBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('asset-explainer'),
  anchor: rulebookAnchorSchema.optional(),
  source: rulebookSourceReferenceSchema.optional(),
  caption: z.string(),
  numbering: z.enum(['automatic', 'custom']),
  colorMode: z.enum(['automatic', 'manual']),
  itemOrder: z.array(rulebookItemIdSchema).max(128),
  itemsById: z.record(rulebookItemIdSchema, assetExplainerItemSchema),
});

const rulebookBlockSchema = z.discriminatedUnion('kind', [
  textBlockSchema,
  repeatedTextBlockSchema,
  ruleGroupBlockSchema,
  assetFigureBlockSchema,
  sectionHeadingBlockSchema,
  listBlockSchema,
  calloutBlockSchema,
  questionAnswerBlockSchema,
  referencedIllustrationBlockSchema,
  illustratedInventoryBlockSchema,
  factionIntroductionBlockSchema,
  cardEntryBlockSchema,
  cardGroupBlockSchema,
  assetExplainerBlockSchema,
]);

type Cardinality = Readonly<{ minimum: number; maximum: number | null }>;

/*
 * A Control region carries two schemas for one value: `valueSchema` proves a new write, `renderValueSchema` reads what is already stored.
 * They differ only where a stored Edition may hold a spelling the current write contract refuses, and the catalogue holds both so a consumer cannot reach for the wrong one.
 */
function controlRegion<const Key extends string, Schema extends z.ZodType, RenderSchema extends z.ZodType = Schema>(
  key: Key,
  label: string,
  valueSchema: Schema,
  initialValue: z.input<Schema>,
  renderValueSchema?: RenderSchema
) {
  return {
    kind: 'control' as const,
    key,
    label,
    valueSchema,
    initialValue,
    renderValueSchema: (renderValueSchema ?? valueSchema) as RenderSchema,
  };
}

function blockRegion<const Key extends string, const Accepted extends readonly RulebookBlockKind[]>(
  key: Key,
  label: string,
  acceptedBlockKinds: Accepted,
  cardinality: Cardinality
) {
  return { kind: 'block' as const, key, label, acceptedBlockKinds, cardinality };
}

const chapterLabelSchema = z.string();
const pageGuidanceSchema = z.strictObject({ eyebrow: z.string(), introduction: normalizedFormattedTextSchema });
const pageGuidanceRenderSchema = pageGuidanceSchema.extend({ introduction: editionFormattedTextSchema });

const widePositionSchema = z.enum(['left', 'right']);
const bandPositionSchema = z.enum(['top', 'bottom']);
const coverControlSchema = z.strictObject({
  artworkAssetId: z.string().min(1).optional(),
  subtitle: z.string(),
  supportingText: z.string(),
});
const unlimitedBlocks = { minimum: 0, maximum: null } as const;

/** Authored layouts and temporarily readable capability layouts share their region contracts. */
export const rulebookLayoutCatalogue = [
  {
    id: 'chapter-opener',
    label: 'Chapter opener',
    regions: [
      controlRegion('chapter-label', 'Chapter label', chapterLabelSchema, ''),
      blockRegion('feature', 'Feature', ['asset-figure', 'rule-group'], { minimum: 0, maximum: 2 }),
    ],
  },
  {
    id: 'rules-page',
    label: 'Rules page',
    regions: [
      controlRegion(
        'guidance',
        'Page guidance',
        pageGuidanceSchema,
        { eyebrow: '', introduction: '' },
        pageGuidanceRenderSchema
      ),
      blockRegion('rules', 'Rules', ['text', 'rule-group'], { minimum: 0, maximum: 6 }),
      blockRegion('examples', 'Examples', ['text', 'repeated-text', 'asset-figure'], { minimum: 0, maximum: 3 }),
    ],
  },
  {
    id: 'visual-reference',
    label: 'Visual reference',
    regions: [
      blockRegion('figures', 'Figures', ['asset-figure'], { minimum: 0, maximum: 2 }),
      blockRegion('notes', 'Notes', ['text', 'repeated-text'], { minimum: 0, maximum: 4 }),
    ],
  },
  {
    id: 'single-column',
    label: 'Single column',
    supportedSizes: ['square', 'a4', 'tall'],
    regions: [blockRegion('content', 'Content', rulebookFinalBlockKinds, unlimitedBlocks)],
  },
  {
    id: 'two-columns',
    label: 'Two equal columns',
    supportedSizes: ['square', 'a4'],
    regions: [
      blockRegion('column1', 'Column 1', rulebookFinalBlockKinds, unlimitedBlocks),
      blockRegion('column2', 'Column 2', rulebookFinalBlockKinds, unlimitedBlocks),
    ],
  },
  {
    id: 'wide-narrow',
    label: 'Wide and narrow columns',
    supportedSizes: ['square', 'a4'],
    regions: [
      blockRegion('wide', 'Wide', rulebookFinalBlockKinds, unlimitedBlocks),
      blockRegion('narrow', 'Narrow', rulebookFinalBlockKinds, unlimitedBlocks),
    ],
  },
  {
    id: 'outer-rail',
    label: 'Outer rail with two columns',
    supportedSizes: ['square', 'a4'],
    regions: [
      blockRegion('rail', 'Outer rail', rulebookFinalBlockKinds, unlimitedBlocks),
      blockRegion('column1', 'Column 1', rulebookFinalBlockKinds, unlimitedBlocks),
      blockRegion('column2', 'Column 2', rulebookFinalBlockKinds, unlimitedBlocks),
    ],
  },
  {
    id: 'band-columns',
    label: 'Band with two columns',
    supportedSizes: ['square', 'a4'],
    regions: [
      blockRegion('band', 'Band', rulebookFinalBlockKinds, unlimitedBlocks),
      blockRegion('column1', 'Column 1', rulebookFinalBlockKinds, unlimitedBlocks),
      blockRegion('column2', 'Column 2', rulebookFinalBlockKinds, unlimitedBlocks),
    ],
  },
  {
    id: 'cover',
    label: 'Cover',
    supportedSizes: ['square', 'a4', 'tall'],
    regions: [controlRegion('cover', 'Cover details', coverControlSchema, { subtitle: '', supportingText: '' })],
  },
] as const;

type RulebookLayoutDefinition = (typeof rulebookLayoutCatalogue)[number];
export type RulebookPageLayoutId = RulebookLayoutDefinition['id'];
type RulebookPageRegionDefinition = RulebookLayoutDefinition['regions'][number];
export type RulebookBlockRegionDefinition = Extract<RulebookPageRegionDefinition, { kind: 'block' }>;
export type RulebookBlockRegionKey = RulebookBlockRegionDefinition['key'];

export function getRulebookLayout<const LayoutId extends RulebookPageLayoutId>(layoutId: LayoutId) {
  return rulebookLayoutCatalogue.find((layout) => layout.id === layoutId)! as Extract<
    RulebookLayoutDefinition,
    { id: LayoutId }
  >;
}

export type RulebookAuthoredLayoutDefinition = Extract<
  RulebookLayoutDefinition,
  { supportedSizes: readonly RulebookSize[] }
>;
export type RulebookAuthoredLayoutId = RulebookAuthoredLayoutDefinition['id'];

/** Only finished layouts supported by the book's fixed Size are offered at creation. */
export function getRulebookLayoutsForSize(size: RulebookSize): RulebookAuthoredLayoutDefinition[] {
  return rulebookLayoutCatalogue.filter(
    (layout): layout is RulebookAuthoredLayoutDefinition =>
      'supportedSizes' in layout && layout.supportedSizes.some((supported) => supported === size)
  );
}

export function isRulebookLayoutSupported(layoutId: RulebookPageLayoutId, size: RulebookSize): boolean {
  return getRulebookLayoutsForSize(size).some((layout) => layout.id === layoutId);
}

/** Region identities stay fixed while their reading order follows the chosen arrangement and Page side. */
export function getRulebookRegionOrder(
  page: Readonly<{ layoutId: RulebookPageLayoutId; controlValues: Readonly<Record<string, unknown>> }>,
  pageNumber = 1
): RulebookBlockRegionKey[] {
  if (page.layoutId === 'wide-narrow') {
    return page.controlValues.widePosition === 'right' ? ['narrow', 'wide'] : ['wide', 'narrow'];
  }
  if (page.layoutId === 'band-columns') {
    return page.controlValues.bandPosition === 'bottom'
      ? ['column1', 'column2', 'band']
      : ['band', 'column1', 'column2'];
  }
  if (page.layoutId === 'outer-rail') {
    return pageNumber % 2 === 0 ? ['rail', 'column1', 'column2'] : ['column1', 'column2', 'rail'];
  }
  return getRulebookLayout(page.layoutId).regions.flatMap((region) => (region.kind === 'block' ? [region.key] : []));
}

const chapterControlValuesSchema = z.strictObject({ 'chapter-label': chapterLabelSchema });
const chapterBlockOrderSchema = z.strictObject({ feature: z.array(rulebookLocalIdSchema) });
const rulesControlValuesSchema = z.strictObject({ guidance: pageGuidanceSchema });
const rulesBlockOrderSchema = z.strictObject({
  rules: z.array(rulebookLocalIdSchema),
  examples: z.array(rulebookLocalIdSchema),
});
const referenceControlValuesSchema = z.strictObject({});
const referenceBlockOrderSchema = z.strictObject({
  figures: z.array(rulebookLocalIdSchema),
  notes: z.array(rulebookLocalIdSchema),
});

function pageSchema<
  const LayoutId extends RulebookPageLayoutId,
  ControlValues extends z.ZodRawShape,
  BlockOrder extends z.ZodRawShape,
>(layoutId: LayoutId, controlValues: z.ZodObject<ControlValues>, blockOrderByRegion: z.ZodObject<BlockOrder>) {
  return z.strictObject({
    id: rulebookLocalIdSchema,
    anchor: rulebookAnchorSchema,
    title: z.string(),
    layoutId: z.literal(layoutId),
    controlValues,
    blockOrderByRegion,
    blocksById: z.record(rulebookLocalIdSchema, rulebookBlockSchema),
  });
}

const chapterOpenerPageSchema = pageSchema('chapter-opener', chapterControlValuesSchema, chapterBlockOrderSchema);
const rulesPageSchema = pageSchema('rules-page', rulesControlValuesSchema, rulesBlockOrderSchema);
const visualReferencePageSchema = pageSchema(
  'visual-reference',
  referenceControlValuesSchema,
  referenceBlockOrderSchema
);
const emptyControlValuesSchema = z.strictObject({});
const columnBlockOrderSchema = z.strictObject({
  column1: z.array(rulebookLocalIdSchema),
  column2: z.array(rulebookLocalIdSchema),
});
const wideControlValuesSchema = z.strictObject({ widePosition: widePositionSchema });
const bandControlValuesSchema = z.strictObject({ bandPosition: bandPositionSchema });
const coverControlValuesSchema = z.strictObject({ cover: coverControlSchema });
const singleColumnPageSchema = pageSchema(
  'single-column',
  emptyControlValuesSchema,
  z.strictObject({ content: z.array(rulebookLocalIdSchema) })
).extend({ showHeading: z.boolean().default(true) });
const twoColumnsPageSchema = pageSchema('two-columns', emptyControlValuesSchema, columnBlockOrderSchema).extend({
  showHeading: z.boolean().default(true),
});
const wideNarrowPageSchema = pageSchema(
  'wide-narrow',
  wideControlValuesSchema,
  z.strictObject({ wide: z.array(rulebookLocalIdSchema), narrow: z.array(rulebookLocalIdSchema) })
).extend({ showHeading: z.boolean().default(true) });
const outerRailPageSchema = pageSchema(
  'outer-rail',
  emptyControlValuesSchema,
  columnBlockOrderSchema.extend({ rail: z.array(rulebookLocalIdSchema) })
).extend({ showHeading: z.boolean().default(true) });
const bandColumnsPageSchema = pageSchema(
  'band-columns',
  bandControlValuesSchema,
  columnBlockOrderSchema.extend({ band: z.array(rulebookLocalIdSchema) })
).extend({ showHeading: z.boolean().default(true) });
const coverPageSchema = pageSchema('cover', coverControlValuesSchema, z.strictObject({})).extend({
  showHeading: z.boolean().default(true),
});

/** One Page on its own; the Contents-level rules between Pages live in `refineRulebookContentsV1`. */
export const rulebookPageV1Schema = z.discriminatedUnion('layoutId', [
  chapterOpenerPageSchema,
  rulesPageSchema,
  visualReferencePageSchema,
  singleColumnPageSchema,
  twoColumnsPageSchema,
  wideNarrowPageSchema,
  outerRailPageSchema,
  bandColumnsPageSchema,
  coverPageSchema,
]);
export type RulebookPageV1 = z.infer<typeof rulebookPageV1Schema>;

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].sort((left, right) => left.localeCompare(right));
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value))
  );
}

const rulebookContentsV1BaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pageOrder: z.array(rulebookLocalIdSchema),
  pagesById: z.record(rulebookLocalIdSchema, rulebookPageV1Schema),
});

type RulebookContentsV1Refinement = Parameters<(typeof rulebookContentsV1BaseSchema)['superRefine']>[0];

/** The rules of Contents version 1 that hold between Pages and within a Page's placement, over Pages the Page schema has accepted. */
const refineRulebookContentsV1: RulebookContentsV1Refinement = (contents, context) => {
  const pageIds = Object.keys(contents.pagesById);
  for (const duplicate of duplicateValues(contents.pageOrder)) {
    context.addIssue({ code: 'custom', path: ['pageOrder'], message: `Page ${duplicate} appears more than once` });
  }
  if (!sameMembers(contents.pageOrder, pageIds)) {
    context.addIssue({
      code: 'custom',
      path: ['pageOrder'],
      message: 'Every Page must appear exactly once in pageOrder',
    });
  }

  const anchors = new Map<string, string>();
  const registerAnchor = (anchor: string, path: string) => {
    const existing = anchors.get(anchor);
    if (existing) {
      context.addIssue({
        code: 'custom',
        path: path.split('.'),
        message: `Anchor ${anchor} is already used by ${existing}`,
      });
    } else {
      anchors.set(anchor, path);
    }
  };

  for (const [pageKey, page] of Object.entries(contents.pagesById)) {
    if (pageKey !== page.id) {
      context.addIssue({
        code: 'custom',
        path: ['pagesById', pageKey, 'id'],
        message: 'Page map key and ID must agree',
      });
    }
    registerAnchor(page.anchor, `pagesById.${pageKey}.anchor`);
    const layout = getRulebookLayout(page.layoutId);
    const placedBlockIds: string[] = [];

    for (const [regionKey, ids] of Object.entries(page.blockOrderByRegion)) {
      placedBlockIds.push(...ids);
      const region = layout.regions.find(
        (candidate): candidate is RulebookBlockRegionDefinition =>
          candidate.kind === 'block' && candidate.key === regionKey
      )!;
      if (ids.length < region.cardinality.minimum) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', pageKey, 'blockOrderByRegion', regionKey],
          message: `Block region ${regionKey} requires at least ${region.cardinality.minimum} Blocks`,
        });
      }
      if (region.cardinality.maximum !== null && ids.length > region.cardinality.maximum) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', pageKey, 'blockOrderByRegion', regionKey],
          message: `Block region ${regionKey} accepts at most ${region.cardinality.maximum} Blocks`,
        });
      }
      for (const blockId of ids) {
        const block = page.blocksById[blockId];
        if (block && !region.acceptedBlockKinds.some((kind) => kind === block.kind)) {
          context.addIssue({
            code: 'custom',
            path: ['pagesById', pageKey, 'blockOrderByRegion', regionKey],
            message: `Block region ${regionKey} does not accept ${block.kind} Blocks`,
          });
        }
      }
    }

    for (const duplicate of duplicateValues(placedBlockIds)) {
      context.addIssue({
        code: 'custom',
        path: ['pagesById', pageKey, 'blockOrderByRegion'],
        message: `Block ${duplicate} is placed more than once on Page ${page.id}`,
      });
    }
    if (!sameMembers(placedBlockIds, Object.keys(page.blocksById))) {
      context.addIssue({
        code: 'custom',
        path: ['pagesById', pageKey, 'blocksById'],
        message: 'Every Block must appear exactly once in a Block region on its Page',
      });
    }

    for (const [blockKey, block] of Object.entries(page.blocksById)) {
      if (blockKey !== block.id) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', pageKey, 'blocksById', blockKey, 'id'],
          message: 'Block map key and ID must agree',
        });
      }
      if (block.anchor) {
        registerAnchor(block.anchor, `pagesById.${pageKey}.blocksById.${blockKey}.anchor`);
      }
      if (!isRulebookCollectionBlock(block)) {
        continue;
      }

      if (
        block.kind === 'card-group' &&
        block.featuredItemId &&
        !Object.hasOwn(block.itemsById, block.featuredItemId)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', pageKey, 'blocksById', blockKey, 'featuredItemId'],
          message: 'The featured Card must belong to this group',
        });
      }
      const itemIds = Object.keys(block.itemsById);
      for (const duplicate of duplicateValues(block.itemOrder)) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', pageKey, 'blocksById', blockKey, 'itemOrder'],
          message: `Repeated item ${duplicate} appears more than once`,
        });
      }
      if (!sameMembers(block.itemOrder, itemIds)) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', pageKey, 'blocksById', blockKey, 'itemOrder'],
          message: 'Every repeated item must appear exactly once in itemOrder',
        });
      }
      for (const [itemKey, item] of Object.entries(block.itemsById)) {
        if (itemKey !== item.id) {
          context.addIssue({
            code: 'custom',
            path: ['pagesById', pageKey, 'blocksById', blockKey, 'itemsById', itemKey, 'id'],
            message: 'Repeated-item map key and ID must agree',
          });
        }
      }
    }
  }
};

/** The runtime and type authority for Rulebook Contents written under the current V1 contract. */
export const rulebookContentsV1Schema = rulebookContentsV1BaseSchema.superRefine(refineRulebookContentsV1);

/**
 * Contents version 1 over Pages a caller has already proven with `rulebookPageV1Schema`, so a caller that keeps a proof per Page proves the whole without proving every Page again.
 * It does not prove the Pages itself: it takes a value with a catalogued layout as a proven Page and applies the same Contents-level refinement, so it is for proven Pages only, never for untrusted input.
 */
export const rulebookContentsV1OverProvenPagesSchema = rulebookContentsV1BaseSchema
  .extend({
    pagesById: z.record(
      rulebookLocalIdSchema,
      z.custom<RulebookPageV1>(
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          rulebookLayoutCatalogue.some((layout) => layout.id === (value as { layoutId?: unknown }).layoutId)
      )
    ),
  })
  .superRefine(refineRulebookContentsV1);

export type RulebookContentsV1 = z.infer<typeof rulebookContentsV1Schema>;

type EditableValue<Value> = Value extends NormalizedFormattedText
  ? string
  : Value extends readonly (infer Item)[]
    ? EditableValue<Item>[]
    : Value extends object
      ? { [Key in keyof Value]: EditableValue<Value[Key]> }
      : Value;

/** Canonical structure with normalized formatted-text values widened to raw editor strings. */
export type RulebookContentsDraftV1 = EditableValue<RulebookContentsV1>;
export type RulebookPageDraft = RulebookContentsDraftV1['pagesById'][string];
export type RulebookBlockDraft = RulebookPageDraft['blocksById'][string];
export type RulebookCollectionBlockDraft = Extract<
  RulebookBlockDraft,
  { kind: 'repeated-text' | 'list' | 'illustrated-inventory' | 'card-group' | 'asset-explainer' }
>;
export function isRulebookCollectionBlock(
  block: RulebookBlockDraft | undefined
): block is RulebookCollectionBlockDraft {
  return (
    block?.kind === 'repeated-text' ||
    block?.kind === 'list' ||
    block?.kind === 'illustrated-inventory' ||
    block?.kind === 'card-group' ||
    block?.kind === 'asset-explainer'
  );
}

const repeatedTextItemDraftSchema = repeatedTextItemSchema.extend({ text: z.string() });
const textBlockDraftSchema = textBlockSchema.extend({ anchor: z.string().optional(), text: z.string() });
const repeatedTextBlockDraftSchema = repeatedTextBlockSchema.extend({
  anchor: z.string().optional(),
  itemsById: z.record(rulebookItemIdSchema, repeatedTextItemDraftSchema),
});
const ruleGroupBlockDraftSchema = ruleGroupBlockSchema.extend({ anchor: z.string().optional(), text: z.string() });
const assetFigureBlockDraftSchema = assetFigureBlockSchema.extend({ anchor: z.string().optional(), text: z.string() });
const listItemDraftSchema = listItemSchema.extend({ text: z.string() });
const sectionHeadingBlockDraftSchema = sectionHeadingBlockSchema.extend({ anchor: z.string().optional() });
const listBlockDraftSchema = listBlockSchema.extend({
  anchor: z.string().optional(),
  itemsById: z.record(rulebookItemIdSchema, listItemDraftSchema),
});
const calloutBlockDraftSchema = calloutBlockSchema.extend({ anchor: z.string().optional(), text: z.string() });
const questionAnswerBlockDraftSchema = questionAnswerBlockSchema.extend({
  anchor: z.string().optional(),
  question: z.string(),
  answer: z.string(),
});
const illustratedInventoryItemDraftSchema = illustratedInventoryItemSchema.extend({ text: z.string() });
const illustratedInventoryBlockDraftSchema = illustratedInventoryBlockSchema.extend({
  anchor: z.string().optional(),
  introduction: z.string(),
  itemsById: z.record(rulebookItemIdSchema, illustratedInventoryItemDraftSchema),
});
const assetExplainerItemDraftSchema = assetExplainerItemSchema.extend({
  text: z.string(),
  color: z.string().optional(),
});
const cardGroupItemDraftSchema = cardGroupItemSchema.extend({ text: z.string() });
const rulebookBlockDraftSchema = z.discriminatedUnion('kind', [
  textBlockDraftSchema,
  repeatedTextBlockDraftSchema,
  ruleGroupBlockDraftSchema,
  assetFigureBlockDraftSchema,
  sectionHeadingBlockDraftSchema,
  listBlockDraftSchema,
  calloutBlockDraftSchema,
  questionAnswerBlockDraftSchema,
  referencedIllustrationBlockSchema.extend({ anchor: z.string().optional() }),
  illustratedInventoryBlockDraftSchema,
  factionIntroductionBlockSchema.extend({ anchor: z.string().optional(), text: z.string() }),
  cardEntryBlockSchema.extend({ anchor: z.string().optional(), text: z.string() }),
  assetExplainerBlockSchema.extend({
    anchor: z.string().optional(),
    itemsById: z.record(rulebookItemIdSchema, assetExplainerItemDraftSchema),
  }),
  cardGroupBlockSchema.extend({
    anchor: z.string().optional(),
    text: z.string(),
    itemsById: z.record(rulebookItemIdSchema, cardGroupItemDraftSchema),
  }),
]);

function draftPageSchema<Schema extends z.ZodRawShape, ControlShape extends z.ZodRawShape>(
  saved: z.ZodObject<Schema>,
  controlValues: z.ZodObject<ControlShape>
) {
  return saved.extend({
    anchor: z.string(),
    controlValues,
    blocksById: z.record(rulebookLocalIdSchema, rulebookBlockDraftSchema),
  });
}

/** Runtime structure authority for editor operation payloads whose direct fields may contain raw text. */
export const rulebookDraftEntitySchemas = {
  page: z.discriminatedUnion('layoutId', [
    draftPageSchema(chapterOpenerPageSchema, chapterControlValuesSchema),
    draftPageSchema(
      rulesPageSchema,
      z.strictObject({ guidance: pageGuidanceSchema.extend({ introduction: z.string() }) })
    ),
    draftPageSchema(visualReferencePageSchema, referenceControlValuesSchema),
    draftPageSchema(singleColumnPageSchema, emptyControlValuesSchema),
    draftPageSchema(twoColumnsPageSchema, emptyControlValuesSchema),
    draftPageSchema(wideNarrowPageSchema, wideControlValuesSchema),
    draftPageSchema(outerRailPageSchema, emptyControlValuesSchema),
    draftPageSchema(bandColumnsPageSchema, bandControlValuesSchema),
    draftPageSchema(coverPageSchema, coverControlValuesSchema),
  ]),
  block: rulebookBlockDraftSchema,
  item: z.union([
    listItemDraftSchema,
    illustratedInventoryItemDraftSchema,
    cardGroupItemDraftSchema,
    assetExplainerItemDraftSchema,
  ]),
} as const;

const editionTextBlockSchema = textBlockSchema.extend({ text: editionFormattedTextSchema });
const editionRepeatedTextBlockSchema = repeatedTextBlockSchema.extend({
  itemsById: z.record(rulebookItemIdSchema, repeatedTextItemSchema.extend({ text: editionFormattedTextSchema })),
});
const editionRuleGroupBlockSchema = ruleGroupBlockSchema.extend({ text: editionFormattedTextSchema });
const editionAssetFigureBlockSchema = assetFigureBlockSchema.extend({ text: editionFormattedTextSchema });
const editionListBlockSchema = listBlockSchema.extend({
  itemsById: z.record(rulebookItemIdSchema, listItemSchema.extend({ text: editionFormattedTextSchema })),
});
const editionCalloutBlockSchema = calloutBlockSchema.extend({ text: editionFormattedTextSchema });
const editionQuestionAnswerBlockSchema = questionAnswerBlockSchema.extend({
  question: editionFormattedTextSchema,
  answer: editionFormattedTextSchema,
});
const editionBlockSchema = z.discriminatedUnion('kind', [
  editionTextBlockSchema,
  editionRepeatedTextBlockSchema,
  editionRuleGroupBlockSchema,
  editionAssetFigureBlockSchema,
  sectionHeadingBlockSchema,
  editionListBlockSchema,
  editionCalloutBlockSchema,
  editionQuestionAnswerBlockSchema,
  referencedIllustrationBlockSchema,
  illustratedInventoryBlockSchema.extend({
    introduction: editionFormattedTextSchema,
    itemsById: z.record(
      rulebookItemIdSchema,
      illustratedInventoryItemSchema.extend({ text: editionFormattedTextSchema })
    ),
  }),
  factionIntroductionBlockSchema.extend({ text: editionFormattedTextSchema }),
  cardEntryBlockSchema.extend({ text: editionFormattedTextSchema }),
  assetExplainerBlockSchema.extend({
    itemsById: z.record(rulebookItemIdSchema, assetExplainerItemSchema.extend({ text: editionFormattedTextSchema })),
  }),
  cardGroupBlockSchema.extend({
    text: editionFormattedTextSchema,
    itemsById: z.record(rulebookItemIdSchema, cardGroupItemSchema.extend({ text: editionFormattedTextSchema })),
  }),
]);

function editionPageSchema<Schema extends z.ZodRawShape, ControlShape extends z.ZodRawShape>(
  saved: z.ZodObject<Schema>,
  controlValues: z.ZodObject<ControlShape>
) {
  return saved.extend({
    controlValues,
    blocksById: z.record(rulebookLocalIdSchema, editionBlockSchema),
  });
}

const rulebookEditionPageV1Schema = z.discriminatedUnion('layoutId', [
  editionPageSchema(chapterOpenerPageSchema, chapterControlValuesSchema),
  editionPageSchema(rulesPageSchema, z.strictObject({ guidance: pageGuidanceRenderSchema })),
  editionPageSchema(visualReferencePageSchema, referenceControlValuesSchema),
  editionPageSchema(singleColumnPageSchema, emptyControlValuesSchema),
  editionPageSchema(twoColumnsPageSchema, emptyControlValuesSchema),
  editionPageSchema(wideNarrowPageSchema, wideControlValuesSchema),
  editionPageSchema(outerRailPageSchema, emptyControlValuesSchema),
  editionPageSchema(bandColumnsPageSchema, bandControlValuesSchema),
  editionPageSchema(coverPageSchema, coverControlValuesSchema),
]);
const rulebookEditionContentsV1BaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pageOrder: z.array(rulebookLocalIdSchema),
  pagesById: z.record(rulebookLocalIdSchema, rulebookEditionPageV1Schema),
});

/** Reads syntax-valid immutable V1 Contents without reapplying today's canonical text spelling. */
export const rulebookEditionContentsV1Schema = rulebookEditionContentsV1BaseSchema.superRefine(
  refineRulebookContentsV1 as Parameters<(typeof rulebookEditionContentsV1BaseSchema)['superRefine']>[0]
);
export type RulebookEditionContentsV1 = z.infer<typeof rulebookEditionContentsV1Schema>;

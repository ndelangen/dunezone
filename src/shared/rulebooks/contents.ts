import { z } from 'zod';

import { normalizeFormattedText, parseFormattedText } from '../formattedText';
import type { NormalizedFormattedText } from '../formattedText';
import { userImageSourceUrlSchema } from '../user-images/contract';
import { rulebookCoverImageSchema } from './coverImage';
import { rulebookCoverPresetIdSchema } from './coverPresets';
import type { RulebookSize } from './settings';
import { rulebookCardSourceReferenceSchema, rulebookSourceReferenceSchema } from './sources';

/** Creation callers declare the catalogue they can read before receiving starter or cloned Contents. */
export const RULEBOOK_CATALOGUE_VERSION = 9;

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

export const rulebookBlockKinds = [
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
  'reference-table',
  'credits',
] as const;
export type RulebookBlockKind = (typeof rulebookBlockKinds)[number];
export const rulebookBlockKindLabels = {
  text: 'Text',
  'section-heading': 'Section heading',
  list: 'List',
  callout: 'Callout',
  'question-answer': 'Question and answer',
  'referenced-illustration': 'Referenced illustration',
  'illustrated-inventory': 'Illustrated inventory',
  'card-entry': 'Card entry',
  'card-group': 'Card group',
  'asset-explainer': 'AssetExplainer',
  'faction-introduction': 'Faction introduction',
  'reference-table': 'Reference table',
  credits: 'Credits',
} satisfies Record<RulebookBlockKind, string>;

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

/**
 * Every Block kind and repeated item, declared once and built for each contract that reads Blocks.
 * Saved Contents, the editor draft and a stored Edition differ only in how they read formatted text, an anchor and an Asset explainer colour.
 */
function rulebookBlockSchemas<Text extends z.ZodType, Anchor extends z.ZodType, Color extends z.ZodType>(
  text: Text,
  anchor: Anchor,
  color: Color
) {
  const textBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('text'),
    name: z.string().optional(),
    anchor: anchor.optional(),
    text,
  });
  const sectionHeadingBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('section-heading'),
    anchor: anchor.optional(),
    title: z.string(),
    factionId: z.string().min(1).optional(),
  });
  const listItem = z.strictObject({
    id: rulebookItemIdSchema,
    name: z.string().optional(),
    text,
  });
  const listBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('list'),
    anchor: anchor.optional(),
    style: z.enum(['bulleted', 'numbered']),
    itemOrder: z.array(rulebookItemIdSchema),
    itemsById: z.record(rulebookItemIdSchema, listItem),
  });
  const calloutBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('callout'),
    anchor: anchor.optional(),
    variant: z.enum(['note', 'example', 'quotation']),
    title: z.string().optional(),
    text,
    attribution: z.string().optional(),
  });
  const questionAnswerBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('question-answer'),
    anchor: anchor.optional(),
    topic: z.string().optional(),
    question: text,
    answer: text,
  });

  const referencedIllustrationBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('referenced-illustration'),
    anchor: anchor.optional(),
    source: rulebookSourceReferenceSchema.optional(),
    caption: z.string(),
  });
  const illustratedInventoryItem = z.strictObject({
    id: rulebookItemIdSchema,
    source: rulebookSourceReferenceSchema.optional(),
    text,
    quantity: z.number().int().nonnegative().optional(),
    caption: z.string().optional(),
  });
  const illustratedInventoryBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('illustrated-inventory'),
    anchor: anchor.optional(),
    title: z.string().optional(),
    introduction: text,
    itemOrder: z.array(rulebookItemIdSchema),
    itemsById: z.record(rulebookItemIdSchema, illustratedInventoryItem),
  });
  const factionIntroductionBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('faction-introduction'),
    flipped: z.boolean().optional(),
    anchor: anchor.optional(),
    factionId: z.string().min(1).optional(),
    text,
  });

  const cardGuideFields = {
    source: rulebookCardSourceReferenceSchema.optional(),
    text,
    quantity: z.number().int().nonnegative().optional(),
  };
  const cardEntryBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('card-entry'),
    anchor: anchor.optional(),
    ...cardGuideFields,
  });
  const cardGroupItem = z.strictObject({ id: rulebookItemIdSchema, ...cardGuideFields });
  const cardGroupBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('card-group'),
    anchor: anchor.optional(),
    title: z.string(),
    text,
    variant: z.enum(['compact', 'gallery', 'featured-member']),
    featuredItemId: rulebookItemIdSchema.optional(),
    itemOrder: z.array(rulebookItemIdSchema),
    itemsById: z.record(rulebookItemIdSchema, cardGroupItem),
  });

  const assetExplainerItem = z.strictObject({
    id: rulebookItemIdSchema,
    label: z.string().max(32),
    color: color.optional(),
    text,
    target: rulebookAssetExplainerTargetSchema,
  });
  const assetExplainerBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('asset-explainer'),
    anchor: anchor.optional(),
    source: rulebookSourceReferenceSchema.optional(),
    caption: z.string(),
    numbering: z.enum(['automatic', 'custom']),
    colorMode: z.enum(['automatic', 'manual']),
    itemOrder: z.array(rulebookItemIdSchema).max(128),
    itemsById: z.record(rulebookItemIdSchema, assetExplainerItem),
  });

  /*
   * A table cell belongs to a column identity and a row identity, so a column carries its cells through reorder and a deleted column takes only its own cells with it.
   * A row stores its cells sparsely by column ID; an absent cell is blank, which is what a newly added column supplies to every row.
   */
  const referenceTableColumn = z.strictObject({ id: rulebookItemIdSchema, label: z.string() });
  const referenceTableRow = z.strictObject({
    id: rulebookItemIdSchema,
    cellsByColumnId: z.record(rulebookItemIdSchema, text),
  });
  const referenceTableBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('reference-table'),
    anchor: anchor.optional(),
    columnOrder: z.array(rulebookItemIdSchema),
    columnsById: z.record(rulebookItemIdSchema, referenceTableColumn),
    rowOrder: z.array(rulebookItemIdSchema),
    rowsById: z.record(rulebookItemIdSchema, referenceTableRow),
    note: text,
  });

  /** A contributor is a name in a credit group, not an application account. */
  const creditsContributor = z.strictObject({
    id: rulebookItemIdSchema,
    name: z.string(),
    role: z.string().optional(),
  });
  const creditsGroup = z.strictObject({
    id: rulebookItemIdSchema,
    heading: z.string(),
    contributorOrder: z.array(rulebookItemIdSchema),
    contributorsById: z.record(rulebookItemIdSchema, creditsContributor),
  });
  const creditsBlock = z.strictObject({
    id: rulebookLocalIdSchema,
    kind: z.literal('credits'),
    anchor: anchor.optional(),
    groupOrder: z.array(rulebookItemIdSchema),
    groupsById: z.record(rulebookItemIdSchema, creditsGroup),
  });

  return {
    block: z.discriminatedUnion('kind', [
      textBlock,
      sectionHeadingBlock,
      listBlock,
      calloutBlock,
      questionAnswerBlock,
      referencedIllustrationBlock,
      illustratedInventoryBlock,
      factionIntroductionBlock,
      cardEntryBlock,
      cardGroupBlock,
      assetExplainerBlock,
      referenceTableBlock,
      creditsBlock,
    ]),
    item: z.union([
      listItem,
      illustratedInventoryItem,
      cardGroupItem,
      assetExplainerItem,
      referenceTableColumn,
      referenceTableRow,
      creditsGroup,
      creditsContributor,
    ]),
    assetExplainerItem,
    assetExplainerBlock,
  };
}

const savedBlockSchemas = rulebookBlockSchemas(
  normalizedFormattedTextSchema,
  rulebookAnchorSchema,
  rulebookAssetExplainerColorSchema
);
export const assetExplainerItemSchema = savedBlockSchemas.assetExplainerItem;
export const assetExplainerBlockSchema = savedBlockSchemas.assetExplainerBlock;

/*
 * The schema argument is what types `initialValue`; the region stores the value, never the schema, because the Page schema is the authority that parses it.
 */
function controlRegion<const Key extends string, Schema extends z.ZodType>(
  key: Key,
  label: string,
  _valueSchema: Schema,
  initialValue: z.input<Schema>
) {
  return { kind: 'control' as const, key, label, initialValue };
}

function blockRegion<const Key extends string>(key: Key, label: string) {
  return { kind: 'block' as const, key, label };
}

const widePositionSchema = z.enum(['left', 'right']);
const bandPositionSchema = z.enum(['top', 'bottom']);
export const rulebookCoverFooterSchema = z.strictObject({
  enabled: z.boolean(),
  title: z.string(),
  label: z.string(),
  leftFactionId: z.string().min(1).optional(),
  rightFactionId: z.string().min(1).optional(),
});
export type RulebookCoverFooter = z.infer<typeof rulebookCoverFooterSchema>;
const initialCoverFooter: RulebookCoverFooter = { enabled: false, title: '', label: '' };
const coverControlSchema = z.strictObject({
  backgroundSource: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('preset'), presetId: rulebookCoverPresetIdSchema }),
      z.strictObject({ kind: z.literal('url') }),
    ])
    .optional(),
  footer: rulebookCoverFooterSchema.optional(),
  artworkAssetId: z.string().min(1).optional(),
  backgroundImageUrl: z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), userImageSourceUrlSchema]))
    .optional(),
  backgroundImage: rulebookCoverImageSchema.optional(),
  showDuneLogo: z.boolean().optional(),
  showSubtitle: z.boolean().optional(),
  subtitle: z.string(),
  supportingText: z.string(),
});
/** The five fixed interior grids and Cover; every Block region accepts the whole catalogue. */
export const rulebookLayoutCatalogue = [
  {
    id: 'single-column',
    label: 'Single column',
    supportedSizes: ['square', 'a4', 'tall'],
    regions: [blockRegion('content', 'Content')],
  },
  {
    id: 'two-columns',
    label: 'Two equal columns',
    supportedSizes: ['square', 'a4'],
    regions: [blockRegion('column1', 'Column 1'), blockRegion('column2', 'Column 2')],
  },
  {
    id: 'wide-narrow',
    label: 'Wide and narrow columns',
    supportedSizes: ['square', 'a4'],
    regions: [blockRegion('wide', 'Wide'), blockRegion('narrow', 'Narrow')],
  },
  {
    id: 'outer-rail',
    label: 'Outer rail with two columns',
    supportedSizes: ['square', 'a4'],
    regions: [
      blockRegion('rail', 'Outer rail'),
      blockRegion('column1', 'Column 1'),
      blockRegion('column2', 'Column 2'),
    ],
  },
  {
    id: 'band-columns',
    label: 'Band with two columns',
    supportedSizes: ['square', 'a4'],
    regions: [blockRegion('band', 'Band'), blockRegion('column1', 'Column 1'), blockRegion('column2', 'Column 2')],
  },
  {
    id: 'cover',
    label: 'Cover',
    supportedSizes: ['square', 'a4', 'tall'],
    regions: [
      controlRegion('cover', 'Cover details', coverControlSchema, {
        backgroundImageUrl: '',
        showDuneLogo: true,
        showSubtitle: true,
        subtitle: '',
        supportingText: '',
      }),
      controlRegion('footer', 'Cover footer', rulebookCoverFooterSchema, initialCoverFooter),
    ],
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

/** Only layouts supported by the book's fixed Size are offered at creation. */
export function getRulebookLayoutsForSize(size: RulebookSize): RulebookLayoutDefinition[] {
  return rulebookLayoutCatalogue.filter((layout) => layout.supportedSizes.some((supported) => supported === size));
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
    blocksById: z.record(rulebookLocalIdSchema, savedBlockSchemas.block),
    showHeading: z.boolean().default(true),
  });
}

const emptyControlValuesSchema = z.strictObject({});
const columnBlockOrderSchema = z.strictObject({
  column1: z.array(rulebookLocalIdSchema),
  column2: z.array(rulebookLocalIdSchema),
});
const wideControlValuesSchema = z.strictObject({ widePosition: widePositionSchema });
const bandControlValuesSchema = z.strictObject({ bandPosition: bandPositionSchema });
const coverControlValuesSchema = z.strictObject({
  cover: coverControlSchema,
  footer: rulebookCoverFooterSchema.optional(),
});
export const rulebookCoverControlValuesDraftSchema = coverControlValuesSchema.extend({
  cover: coverControlSchema.extend({ backgroundImageUrl: z.string().optional() }),
});

/** An explicit footer region takes precedence over the footer stored by earlier Cover editors. */
export function getRulebookCoverFooter(
  controls: z.infer<typeof rulebookCoverControlValuesDraftSchema>
): RulebookCoverFooter {
  return controls.footer ?? controls.cover.footer ?? { ...initialCoverFooter };
}

/** Compares or writes the footer as its own region without retaining a second, inactive copy. */
export function canonicalRulebookCoverControlValues(controls: z.infer<typeof rulebookCoverControlValuesDraftSchema>) {
  const { footer: _legacyFooter, ...cover } = controls.cover;
  return { ...controls, cover, footer: getRulebookCoverFooter(controls) };
}
const singleColumnPageSchema = pageSchema(
  'single-column',
  emptyControlValuesSchema,
  z.strictObject({ content: z.array(rulebookLocalIdSchema) })
);
const twoColumnsPageSchema = pageSchema('two-columns', emptyControlValuesSchema, columnBlockOrderSchema);
const wideNarrowPageSchema = pageSchema(
  'wide-narrow',
  wideControlValuesSchema,
  z.strictObject({ wide: z.array(rulebookLocalIdSchema), narrow: z.array(rulebookLocalIdSchema) })
);
const outerRailPageSchema = pageSchema(
  'outer-rail',
  emptyControlValuesSchema,
  columnBlockOrderSchema.extend({ rail: z.array(rulebookLocalIdSchema) })
);
const bandColumnsPageSchema = pageSchema(
  'band-columns',
  bandControlValuesSchema,
  columnBlockOrderSchema.extend({ band: z.array(rulebookLocalIdSchema) })
);
const coverPageSchema = pageSchema('cover', coverControlValuesSchema, z.strictObject({}));

/** One Page on its own; the Contents-level rules between Pages live in `refineRulebookContentsV1`. */
export const rulebookPageV1Schema = z.discriminatedUnion('layoutId', [
  singleColumnPageSchema,
  twoColumnsPageSchema,
  wideNarrowPageSchema,
  outerRailPageSchema,
  bandColumnsPageSchema,
  coverPageSchema,
]);
export type RulebookPageV1 = z.infer<typeof rulebookPageV1Schema>;

/** The values that occur more than once, each named once and in sorted order. */
export function duplicateValues(values: readonly string[]): readonly string[] {
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
    const placedBlockIds = Object.values(page.blockOrderByRegion).flat();

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
      const blockPath = ['pagesById', pageKey, 'blocksById', blockKey];
      const blockItemIds: string[] = [];
      for (const collection of rulebookItemCollections(block)) {
        const paths = rulebookItemCollectionPaths(collection);
        const orderPath = [...blockPath, ...paths.order];
        const itemIds = Object.keys(collection.byId);
        blockItemIds.push(...itemIds);
        for (const duplicate of duplicateValues(collection.order)) {
          context.addIssue({
            code: 'custom',
            path: orderPath,
            message: `Repeated item ${duplicate} appears more than once`,
          });
        }
        if (!sameMembers(collection.order, itemIds)) {
          context.addIssue({
            code: 'custom',
            path: orderPath,
            message: 'Every repeated item must appear exactly once in its order',
          });
        }
        for (const [itemKey, item] of Object.entries(collection.byId)) {
          if (itemKey !== item.id) {
            context.addIssue({
              code: 'custom',
              path: [...blockPath, ...paths.byId, itemKey, 'id'],
              message: 'Repeated-item map key and ID must agree',
            });
          }
        }
      }
      /* Item refs name an item by Block and ID alone, so a column, row, group or contributor may not share an ID within its Block. */
      for (const duplicate of duplicateValues(blockItemIds)) {
        context.addIssue({
          code: 'custom',
          path: blockPath,
          message: `Repeated item ${duplicate} is identified more than once in Block ${block.id}`,
        });
      }
      if (block.kind === 'reference-table') {
        for (const [rowId, row] of Object.entries(block.rowsById)) {
          for (const columnId of Object.keys(row.cellsByColumnId)) {
            if (!Object.hasOwn(block.columnsById, columnId)) {
              context.addIssue({
                code: 'custom',
                path: [...blockPath, 'rowsById', rowId, 'cellsByColumnId', columnId],
                message: `Cell column ${columnId} is not a column of this table`,
              });
            }
          }
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

/** A parsed value with normalized formatted text widened to the raw strings an editor holds, keeping tuple positions. */
export type EditableValue<Value> = Value extends NormalizedFormattedText
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

/** Canonical structure with normalized formatted-text values widened to raw editor strings. */
export type RulebookContentsDraftV1 = EditableValue<RulebookContentsV1>;
export type RulebookPageDraft = RulebookContentsDraftV1['pagesById'][string];
export type RulebookBlockDraft = RulebookPageDraft['blocksById'][string];
export type RulebookCollectionBlockDraft = Extract<
  RulebookBlockDraft,
  { kind: 'list' | 'illustrated-inventory' | 'card-group' | 'asset-explainer' }
>;
/** The Blocks whose one repeated collection is `itemOrder` and `itemsById`; `rulebookItemCollections` reaches every collection a Block owns. */
export function isRulebookCollectionBlock(
  block: RulebookBlockDraft | undefined
): block is RulebookCollectionBlockDraft {
  return (
    block?.kind === 'list' ||
    block?.kind === 'illustrated-inventory' ||
    block?.kind === 'card-group' ||
    block?.kind === 'asset-explainer'
  );
}

export const rulebookItemCollectionKeys = ['columns', 'rows', 'groups', 'contributors'] as const;
/** Names a repeated collection other than a Block's own `itemOrder`; `contributors` is owned by a Credits group rather than by the Block. */
export type RulebookItemCollectionKey = (typeof rulebookItemCollectionKeys)[number];
export type RulebookItemDraft = z.infer<(typeof rulebookDraftEntitySchemas)['item']>;

/**
 * One ordered collection of identified items, read live from the Block that owns it so an order or map edit through it lands in the draft.
 * `collection` is absent for a Block's own `itemOrder`;
 * a nested collection also names the item that owns it.
 */
export type RulebookItemCollection = Readonly<{
  collection?: RulebookItemCollectionKey;
  ownerItemId?: string;
  order: string[];
  byId: Record<string, RulebookItemDraft>;
}>;

/** Every repeated collection a Block owns, including the contributor collection of each Credits group. */
export function rulebookItemCollections(block: RulebookBlockDraft | undefined): RulebookItemCollection[] {
  if (isRulebookCollectionBlock(block)) {
    return [{ order: block.itemOrder, byId: block.itemsById }];
  }
  if (block?.kind === 'reference-table') {
    return [
      { collection: 'columns', order: block.columnOrder, byId: block.columnsById },
      { collection: 'rows', order: block.rowOrder, byId: block.rowsById },
    ];
  }
  if (block?.kind === 'credits') {
    return [
      { collection: 'groups', order: block.groupOrder, byId: block.groupsById },
      ...Object.values(block.groupsById).map((group) => ({
        collection: 'contributors' as const,
        ownerItemId: group.id,
        order: group.contributorOrder,
        byId: group.contributorsById,
      })),
    ];
  }
  return [];
}

/** The collection a container names, or undefined when the Block does not own one by that name. */
export function rulebookItemCollection(
  block: RulebookBlockDraft | undefined,
  named: Readonly<{ collection?: RulebookItemCollectionKey; ownerItemId?: string }>
): RulebookItemCollection | undefined {
  return rulebookItemCollections(block).find(
    (candidate) =>
      candidate.collection === named.collection && (candidate.ownerItemId ?? null) === (named.ownerItemId ?? null)
  );
}

/** Locates an item by its Block-unique ID, wherever the Block keeps it. */
export function findRulebookItem(
  block: RulebookBlockDraft | undefined,
  itemId: string
): Readonly<{ collection: RulebookItemCollection; item: RulebookItemDraft }> | undefined {
  for (const collection of rulebookItemCollections(block)) {
    if (Object.hasOwn(collection.byId, itemId)) {
      return { collection, item: collection.byId[itemId]! };
    }
  }
  return undefined;
}

/** The stored property paths behind a collection, for issue paths that point into the Contents value. */
function rulebookItemCollectionPaths(collection: RulebookItemCollection): Readonly<{
  order: string[];
  byId: string[];
}> {
  switch (collection.collection) {
    case undefined:
      return { order: ['itemOrder'], byId: ['itemsById'] };
    case 'columns':
      return { order: ['columnOrder'], byId: ['columnsById'] };
    case 'rows':
      return { order: ['rowOrder'], byId: ['rowsById'] };
    case 'groups':
      return { order: ['groupOrder'], byId: ['groupsById'] };
    case 'contributors': {
      const group = ['groupsById', collection.ownerItemId ?? ''];
      return { order: [...group, 'contributorOrder'], byId: [...group, 'contributorsById'] };
    }
  }
}

const draftBlockSchemas = rulebookBlockSchemas(z.string(), z.string(), z.string());

function draftPageSchema<Schema extends z.ZodRawShape, ControlShape extends z.ZodRawShape>(
  saved: z.ZodObject<Schema>,
  controlValues: z.ZodObject<ControlShape>
) {
  return saved.extend({
    anchor: z.string(),
    controlValues,
    blocksById: z.record(rulebookLocalIdSchema, draftBlockSchemas.block),
  });
}

/** Runtime structure authority for editor operation payloads whose direct fields may contain raw text. */
export const rulebookDraftEntitySchemas = {
  page: z.discriminatedUnion('layoutId', [
    draftPageSchema(singleColumnPageSchema, emptyControlValuesSchema),
    draftPageSchema(twoColumnsPageSchema, emptyControlValuesSchema),
    draftPageSchema(wideNarrowPageSchema, wideControlValuesSchema),
    draftPageSchema(outerRailPageSchema, emptyControlValuesSchema),
    draftPageSchema(bandColumnsPageSchema, bandControlValuesSchema),
    draftPageSchema(coverPageSchema, rulebookCoverControlValuesDraftSchema),
  ]),
  block: draftBlockSchemas.block,
  item: draftBlockSchemas.item,
} as const;

const editionBlockSchemas = rulebookBlockSchemas(
  editionFormattedTextSchema,
  rulebookAnchorSchema,
  rulebookAssetExplainerColorSchema
);

function editionPageSchema<Schema extends z.ZodRawShape, ControlShape extends z.ZodRawShape>(
  saved: z.ZodObject<Schema>,
  controlValues: z.ZodObject<ControlShape>
) {
  return saved.extend({
    controlValues,
    blocksById: z.record(rulebookLocalIdSchema, editionBlockSchemas.block),
  });
}

const rulebookEditionPageV1Schema = z.discriminatedUnion('layoutId', [
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

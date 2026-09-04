import { z } from 'zod';

import { normalizeFormattedText } from '../formattedText';
import type { NormalizedFormattedText } from '../formattedText';

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

export const rulebookBlockKinds = ['text', 'repeated-text', 'rule-group', 'asset-figure'] as const;
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

export const rulebookAnchorSchema = z
  .string()
  .min(1, 'An anchor is required')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens');

export const rulebookItemIdSchema = z.string().min(1);

const textBlockSchema = z.strictObject({
  id: rulebookLocalIdSchema,
  kind: z.literal('text'),
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

const rulebookBlockSchema = z.discriminatedUnion('kind', [
  textBlockSchema,
  repeatedTextBlockSchema,
  ruleGroupBlockSchema,
  assetFigureBlockSchema,
]);

type Cardinality = Readonly<{ minimum: number; maximum: number | null }>;

function controlRegion<const Key extends string, Schema extends z.ZodType>(
  key: Key,
  label: string,
  valueSchema: Schema,
  initialValue: z.input<Schema>
) {
  return { kind: 'control' as const, key, label, valueSchema, initialValue };
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

/** The capability-test Page layouts. Region order and constraints belong to this application-owned catalogue. */
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
      controlRegion('guidance', 'Page guidance', pageGuidanceSchema, { eyebrow: '', introduction: '' }),
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
/** One Page on its own; the Contents-level rules between Pages live in `refineRulebookContentsV1`. */
export const rulebookPageV1Schema = z.discriminatedUnion('layoutId', [
  chapterOpenerPageSchema,
  rulesPageSchema,
  visualReferencePageSchema,
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
      if (block.kind !== 'repeated-text') {
        continue;
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

/** The sole runtime and type authority for persisted Rulebook Contents version 1. */
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

const repeatedTextItemDraftSchema = repeatedTextItemSchema.extend({ text: z.string() });
const textBlockDraftSchema = textBlockSchema.extend({ anchor: z.string().optional(), text: z.string() });
const repeatedTextBlockDraftSchema = repeatedTextBlockSchema.extend({
  anchor: z.string().optional(),
  itemsById: z.record(rulebookItemIdSchema, repeatedTextItemDraftSchema),
});
const ruleGroupBlockDraftSchema = ruleGroupBlockSchema.extend({ anchor: z.string().optional(), text: z.string() });
const assetFigureBlockDraftSchema = assetFigureBlockSchema.extend({ anchor: z.string().optional(), text: z.string() });
const rulebookBlockDraftSchema = z.discriminatedUnion('kind', [
  textBlockDraftSchema,
  repeatedTextBlockDraftSchema,
  ruleGroupBlockDraftSchema,
  assetFigureBlockDraftSchema,
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
  ]),
  block: rulebookBlockDraftSchema,
  item: repeatedTextItemDraftSchema,
} as const;

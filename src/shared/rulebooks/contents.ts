import { normalizeFormattedText } from '@shared/formattedText';
import type { NormalizedFormattedText } from '@shared/formattedText';
import { z } from 'zod';

const rulebookBlockKinds = ['text', 'repeated-text'] as const;

const unboundedBootstrapSlot = {
  acceptedBlockKinds: rulebookBlockKinds,
  cardinality: { minimum: 0, maximum: null },
} as const;

export const rulebookLayoutCatalogue = [
  { id: 'single-column', slots: [{ id: 'body', ...unboundedBootstrapSlot }] },
  {
    id: 'two-columns',
    slots: [
      { id: 'left', ...unboundedBootstrapSlot },
      { id: 'right', ...unboundedBootstrapSlot },
    ],
  },
] as const;

type RulebookLayoutDefinition = (typeof rulebookLayoutCatalogue)[number];
export type RulebookSlotId = RulebookLayoutDefinition['slots'][number]['id'];

const rulebookPageIdSchema = z.string().min(1);
const rulebookBlockIdSchema = z.string().min(1);
const rulebookItemIdSchema = z.string().min(1);
export const rulebookAnchorSchema = z
  .string()
  .min(1, 'An anchor is required')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens');

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

const textBlockSchema = z.strictObject({
  id: rulebookBlockIdSchema,
  kind: z.literal(rulebookBlockKinds[0]),
  anchor: rulebookAnchorSchema.optional(),
  text: normalizedFormattedTextSchema,
});

const repeatedTextItemSchema = z.strictObject({
  id: rulebookItemIdSchema,
  text: normalizedFormattedTextSchema,
});

const repeatedTextBlockSchema = z.strictObject({
  id: rulebookBlockIdSchema,
  kind: z.literal(rulebookBlockKinds[1]),
  anchor: rulebookAnchorSchema.optional(),
  itemOrder: z.array(rulebookItemIdSchema),
  itemsById: z.record(rulebookItemIdSchema, repeatedTextItemSchema),
});

const rulebookBlockSchema = z.discriminatedUnion('kind', [textBlockSchema, repeatedTextBlockSchema]);

function slotSchema<const Slots extends readonly { readonly id: string }[]>(slotDefinitions: Slots) {
  const slots = Object.fromEntries(slotDefinitions.map(({ id }) => [id, z.array(rulebookBlockIdSchema)])) as {
    [Slot in Slots[number] as Slot['id']]: z.ZodArray<typeof rulebookBlockIdSchema>;
  };
  return z.strictObject(slots);
}

const singleColumnPageSchema = z.strictObject({
  id: rulebookPageIdSchema,
  anchor: rulebookAnchorSchema,
  layoutId: z.literal(rulebookLayoutCatalogue[0].id),
  slots: slotSchema(rulebookLayoutCatalogue[0].slots),
});
const twoColumnsPageSchema = z.strictObject({
  id: rulebookPageIdSchema,
  anchor: rulebookAnchorSchema,
  layoutId: z.literal(rulebookLayoutCatalogue[1].id),
  slots: slotSchema(rulebookLayoutCatalogue[1].slots),
});

const rulebookPageSchema = z.discriminatedUnion('layoutId', [singleColumnPageSchema, twoColumnsPageSchema]);

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].sort();
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value))
  );
}

const rulebookContentsV1BaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pageOrder: z.array(rulebookPageIdSchema),
  pagesById: z.record(rulebookPageIdSchema, rulebookPageSchema),
  blocksById: z.record(rulebookBlockIdSchema, rulebookBlockSchema),
});

/** The sole runtime and type authority for persisted Rulebook Contents version 1. */
export const rulebookContentsV1Schema = rulebookContentsV1BaseSchema.superRefine((contents, context) => {
  const pageIds = Object.keys(contents.pagesById);
  const blockIds = Object.keys(contents.blocksById);

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

  const placedBlockIds: string[] = [];
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

  for (const [key, page] of Object.entries(contents.pagesById)) {
    if (key !== page.id) {
      context.addIssue({ code: 'custom', path: ['pagesById', key, 'id'], message: 'Page map key and ID must agree' });
    }
    registerAnchor(page.anchor, `pagesById.${key}.anchor`);
    const layout = rulebookLayoutCatalogue.find(({ id }) => id === page.layoutId)!;
    for (const [slotId, ids] of Object.entries(page.slots)) {
      placedBlockIds.push(...ids);
      const slot = layout.slots.find((candidate) => candidate.id === slotId)!;
      if (ids.length < slot.cardinality.minimum) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', key, 'slots', slotId],
          message: `Slot ${slotId} requires at least ${slot.cardinality.minimum} Blocks`,
        });
      }
      if (slot.cardinality.maximum !== null && ids.length > slot.cardinality.maximum) {
        context.addIssue({
          code: 'custom',
          path: ['pagesById', key, 'slots', slotId],
          message: `Slot ${slotId} accepts at most ${slot.cardinality.maximum} Blocks`,
        });
      }
      for (const blockId of ids) {
        const block = contents.blocksById[blockId];
        if (block && !slot.acceptedBlockKinds.some((kind) => kind === block.kind)) {
          context.addIssue({
            code: 'custom',
            path: ['pagesById', key, 'slots', slotId],
            message: `Slot ${slotId} does not accept ${block.kind} Blocks`,
          });
        }
      }
    }
  }

  for (const duplicate of duplicateValues(placedBlockIds)) {
    context.addIssue({
      code: 'custom',
      path: ['pagesById'],
      message: `Block ${duplicate} is placed more than once`,
    });
  }
  if (!sameMembers(placedBlockIds, blockIds)) {
    context.addIssue({
      code: 'custom',
      path: ['blocksById'],
      message: 'Every Block must appear exactly once in a Page slot',
    });
  }

  const allItemIds: string[] = [];
  for (const [key, block] of Object.entries(contents.blocksById)) {
    if (key !== block.id) {
      context.addIssue({ code: 'custom', path: ['blocksById', key, 'id'], message: 'Block map key and ID must agree' });
    }
    if (block.anchor) {
      registerAnchor(block.anchor, `blocksById.${key}.anchor`);
    }
    if (block.kind !== 'repeated-text') {
      continue;
    }

    const itemIds = Object.keys(block.itemsById);
    for (const duplicate of duplicateValues(block.itemOrder)) {
      context.addIssue({
        code: 'custom',
        path: ['blocksById', key, 'itemOrder'],
        message: `Repeated item ${duplicate} appears more than once`,
      });
    }
    if (!sameMembers(block.itemOrder, itemIds)) {
      context.addIssue({
        code: 'custom',
        path: ['blocksById', key, 'itemOrder'],
        message: 'Every repeated item must appear exactly once in itemOrder',
      });
    }
    for (const [itemKey, item] of Object.entries(block.itemsById)) {
      if (itemKey !== item.id) {
        context.addIssue({
          code: 'custom',
          path: ['blocksById', key, 'itemsById', itemKey, 'id'],
          message: 'Repeated-item map key and ID must agree',
        });
      }
      allItemIds.push(item.id);
    }
  }

  for (const duplicate of duplicateValues(allItemIds)) {
    context.addIssue({
      code: 'custom',
      path: ['blocksById'],
      message: `Repeated-item ID ${duplicate} is used by more than one Block`,
    });
  }
});

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
export type RulebookBlockDraft = RulebookContentsDraftV1['blocksById'][string];

const repeatedTextItemDraftSchema = repeatedTextItemSchema.extend({ text: z.string() });
const textBlockDraftSchema = textBlockSchema.extend({ anchor: z.string().optional(), text: z.string() });
const repeatedTextBlockDraftSchema = repeatedTextBlockSchema.extend({
  anchor: z.string().optional(),
  itemsById: z.record(rulebookItemIdSchema, repeatedTextItemDraftSchema),
});

/** Runtime structure authority for editor operation payloads whose direct fields may contain raw text. */
export const rulebookDraftEntitySchemas = {
  page: z.discriminatedUnion('layoutId', [
    singleColumnPageSchema.extend({ anchor: z.string() }),
    twoColumnsPageSchema.extend({ anchor: z.string() }),
  ]),
  block: z.discriminatedUnion('kind', [textBlockDraftSchema, repeatedTextBlockDraftSchema]),
  item: repeatedTextItemDraftSchema,
} as const;

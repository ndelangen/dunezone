import { z } from 'zod';

import { ASSET_TYPE_KEYS } from '../assets/types';
import { parseAssetDataForWrite } from '../assets/validation';
import { FactionWriteSchema } from '../factions/schema';
import { rulebookContentsV1Schema } from '../rulebooks/contents';
import { rulebookNameSchema } from '../rulebooks/metadata';
import { RULEBOOK_PDF_MAX_PAGES } from '../rulebooks/pdfOptimization';
import { rulebookSettingsSchema } from '../rulebooks/settings';
import { RULESET_ASSET_SLOTS } from '../rulesets/assetSlots';

const keySchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(160);
const bindingSchema = z.strictObject({
  path: z
    .array(
      z
        .string()
        .min(1)
        .refine((key) => !['__proto__', 'prototype', 'constructor'].includes(key))
    )
    .min(1)
    .max(32),
  key: keySchema,
  field: z.enum(['id', 'slug']),
});
const common = {
  key: keySchema,
  expectedStateHash: z.string().min(1).max(256).optional(),
  existing: z.strictObject({ slug: keySchema }).optional(),
  bindings: z.array(bindingSchema).max(500).optional(),
};
export const importRulebookDataSchema = z.strictObject({
  name: rulebookNameSchema,
  settings: rulebookSettingsSchema,
  contents: rulebookContentsV1Schema.refine(
    (contents) => contents.pageOrder.length > 0 && contents.pageOrder.length <= RULEBOOK_PDF_MAX_PAGES,
    { message: `Use between 1 and ${RULEBOOK_PDF_MAX_PAGES} Pages per imported Rulebook.` }
  ),
});
export const contentImportItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...common, kind: z.literal('faction'), data: z.unknown(), link: z.boolean().optional() }),
  z.strictObject({
    ...common,
    kind: z.literal('asset'),
    type: z.enum(ASSET_TYPE_KEYS),
    data: z.unknown(),
    members: z
      .array(z.strictObject({ key: keySchema, count: z.number().int().min(1).max(99) }))
      .max(500)
      .optional(),
    slot: z
      .enum(
        Object.keys(RULESET_ASSET_SLOTS) as [keyof typeof RULESET_ASSET_SLOTS, ...(keyof typeof RULESET_ASSET_SLOTS)[]]
      )
      .optional(),
  }),
  z.strictObject({ ...common, kind: z.literal('rulebook'), data: z.unknown() }),
]);
export const contentImportPackageSchema = z
  .strictObject({
    format: z.literal('dunezone-package'),
    version: z.literal(1),
    packageKey: keySchema,
    items: z.array(contentImportItemSchema).min(1).max(500),
  })
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    const singleSlots = new Set<string>();
    value.items.forEach((item, index) => {
      if (keys.has(item.key)) {
        ctx.addIssue({ code: 'custom', path: ['items', index, 'key'], message: 'Each package key must appear once.' });
      }
      for (const key of [
        ...(item.bindings ?? []).map((binding) => binding.key),
        ...(item.kind === 'asset' ? (item.members ?? []).map((member) => member.key) : []),
      ]) {
        if (!keys.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index],
            message: `Put dependency ${key} before ${item.key}.`,
          });
        }
      }
      if (item.kind === 'asset' && item.members) {
        if (!['deck', 'bundle'].includes(item.type)) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'members'],
            message: 'Only decks and bundles have members.',
          });
        }
        if (new Set(item.members.map((member) => member.key)).size !== item.members.length) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'members'],
            message: 'List each member once and use its count.',
          });
        }
      }
      if (item.kind === 'asset' && item.slot && RULESET_ASSET_SLOTS[item.slot].holds !== item.type) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'slot'],
          message: 'Choose a Ruleset slot that accepts this asset type.',
        });
      }
      if (item.kind === 'asset' && item.slot && RULESET_ASSET_SLOTS[item.slot].single) {
        if (singleSlots.has(item.slot)) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'slot'],
            message: `Only one package item may fill the ${item.slot} slot.`,
          });
        }
        singleSlots.add(item.slot);
      }
      keys.add(item.key);
    });
  });
export type ContentImportItem = z.infer<typeof contentImportItemSchema>;
export type ContentImportPackage = z.infer<typeof contentImportPackageSchema>;
export type ContentImportTarget = { rulesetSlug: string; groupSlug: string };
export type ContentImportBinding = { id: string; slug: string };

/** Only explicit binding paths are rewritten; prose and unrelated strings remain unchanged. */
export function bindImportData(item: ContentImportItem, resolve: (key: string) => ContentImportBinding): unknown {
  const data: unknown = structuredClone(item.data);
  for (const binding of item.bindings ?? []) {
    let parent = data;
    for (const part of binding.path.slice(0, -1)) {
      if (typeof parent !== 'object' || parent === null || !Object.hasOwn(parent, part)) {
        throw new Error(`Binding path ${binding.path.join('.')} is missing.`);
      }
      parent = (parent as Record<string, unknown>)[part];
    }
    const last = binding.path.at(-1)!;
    if (typeof parent !== 'object' || parent === null || !Object.hasOwn(parent, last)) {
      throw new Error(`Binding path ${binding.path.join('.')} is missing.`);
    }
    (parent as Record<string, unknown>)[last] = resolve(binding.key)[binding.field];
  }
  return data;
}

export function validateImportData(item: ContentImportItem, data: unknown) {
  if (item.kind === 'faction') {
    return FactionWriteSchema.parse(data);
  }
  if (item.kind === 'rulebook') {
    return importRulebookDataSchema.parse(data);
  }
  return parseAssetDataForWrite(item.type, data).data;
}

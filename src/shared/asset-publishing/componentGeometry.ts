import { z } from 'zod';

const unitCoordinateSchema = z.number().finite().min(0).max(1);
const pathNumberSchema = z.number().finite().min(-100_000).max(100_000);
/** Only bounded numeric path commands cross the publication boundary. */
function boundedPath(value: string): boolean {
  const tokens = value.match(/[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const rest = value
    .replace(/[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g, '')
    .replace(/[\s,]/g, '');
  return (
    rest.length === 0 &&
    tokens.length <= 5000 &&
    tokens.every(
      (token) => /^[A-Za-z]$/.test(token) || (Number.isFinite(Number(token)) && Math.abs(Number(token)) <= 100_000)
    )
  );
}

const componentPartSchema = z.strictObject({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().max(120).optional(),
  x: unitCoordinateSchema,
  y: unitCoordinateSchema,
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
  highlight: z
    .strictObject({
      paths: z
        .array(
          z.strictObject({
            d: z
              .string()
              .min(1)
              .max(20_000)
              .regex(/^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/)
              .refine(boundedPath),
            transform: z
              .tuple([
                pathNumberSchema,
                pathNumberSchema,
                pathNumberSchema,
                pathNumberSchema,
                pathNumberSchema,
                pathNumberSchema,
              ])
              .optional(),
          })
        )
        .min(1)
        .max(128),
    })
    .optional(),
});

/** Bounds belong to the completed image and use its top-left corner as their origin. */
export const componentGeometrySchema = z
  .strictObject({
    width: z.number().finite().positive().max(20_000),
    height: z.number().finite().positive().max(20_000),
    parts: z.array(componentPartSchema).max(128),
  })
  .superRefine(({ parts }, refinement) => {
    const keys = new Set<string>();
    for (const [index, part] of parts.entries()) {
      if (keys.has(part.key)) {
        refinement.addIssue({ code: 'custom', path: ['parts', index, 'key'], message: 'Component part is repeated' });
      }
      keys.add(part.key);
      if (part.x + part.width > 1.000001 || part.y + part.height > 1.000001) {
        refinement.addIssue({ code: 'custom', path: ['parts', index], message: 'Component part exceeds its image' });
      }
    }
  });

export type ComponentGeometry = z.infer<typeof componentGeometrySchema>;

export const COMPONENT_GEOMETRY_PROTOCOL = {
  attribute: 'data-publisher-component-geometry',
  partAttribute: 'data-component-part',
  partSelector: '[data-component-part]',
} as const;

/** Named parts only exist when the renderer measures visible content for this publication. */
export const COMPONENT_PART_LABELS: Record<string, string> = {
  portrait: 'Portrait',
  name: 'Name',
  strength: 'Fighting strength',
  'faction-emblem': 'Faction emblem',
  head: 'Head',
  type: 'Type',
  icon: 'Icon',
  decals: 'Decals',
  body: 'Body',
  symbol: 'Symbol',
  'top-text': 'Top text',
  'bottom-text': 'Bottom text',
  ring: 'Ring',
};

export const COMPONENT_ASSET_TYPES = [
  'faction-leader',
  'card-treachery',
  'token-disc',
  'token-tech',
  'token-plate',
  'token-enhance',
] as const;
export type ComponentAssetType = (typeof COMPONENT_ASSET_TYPES)[number];
export function isComponentAssetType(value: string): value is ComponentAssetType {
  return (COMPONENT_ASSET_TYPES as readonly string[]).includes(value);
}

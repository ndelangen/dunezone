import { z } from 'zod';

const unitCoordinateSchema = z.number().finite().min(0).max(1);
const componentPartSchema = z.strictObject({
  key: z.enum(['portrait', 'name', 'strength', 'faction-emblem']),
  x: unitCoordinateSchema,
  y: unitCoordinateSchema,
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
});

/** Bounds belong to the completed image and use its top-left corner as their origin. */
export const componentGeometrySchema = z
  .strictObject({
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    parts: z.array(componentPartSchema),
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

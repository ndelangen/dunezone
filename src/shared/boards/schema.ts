import { z } from 'zod';

import { ALL } from '../assetIds';
import { at } from './curves';

const finite = z.number().finite();
const point = z.tuple([finite, finite]);
const identity = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9.,:| -]*$/)
  .max(2048);
const anchor = z.strictObject({ edge: identity, t: finite.min(0).max(1), offset: point });
const contour = z.strictObject({
  role: z.enum(['band', 'inset']),
  segments: z
    .array(
      z.strictObject({
        kind: z.enum(['M', 'L', 'C', 'Q', 'A', 'Z']),
        values: z.array(z.union([finite, anchor])).max(7),
      })
    )
    .max(1024),
  fill: z.string().regex(/^(none|#[a-fA-F0-9]{3,8})$/),
  stroke: z.string().regex(/^(none|#[a-fA-F0-9]{3,8})$/),
  strokeWidth: finite.min(0).max(50),
  strokeLinecap: z.enum(['round', 'square', 'butt']),
  strokeLinejoin: z.enum(['round', 'bevel', 'miter']),
  strokeDasharray: z
    .string()
    .regex(/^[\d. ,]+$/)
    .optional(),
  strokeDashoffset: z
    .string()
    .regex(/^-?[\d.]+$/)
    .optional(),
});
const edge = z
  .strictObject({
    id: identity,
    a: identity,
    b: identity,
    kind: z.enum(['line', 'cubic', 'arc']),
    c1: point.optional(),
    c2: point.optional(),
    arc: z
      .tuple([
        finite.positive(),
        finite.positive(),
        finite,
        z.union([z.literal(0), z.literal(1)]),
        z.union([z.literal(0), z.literal(1)]),
      ])
      .optional(),
    strokeWidth: finite.min(0).max(50).optional(),
    fixed: z.boolean().optional(),
  })
  .refine((e) => e.a !== e.b && (e.kind !== 'cubic' || (!!e.c1 && !!e.c2)) && (e.kind !== 'arc' || !!e.arc), {
    message: 'Each boundary needs distinct endpoints and its curve controls',
  });
const decal = z.strictObject({
  id: identity,
  artwork: ALL.refine((path) => path.startsWith('/vector/'), { message: 'Choose bundled vector artwork' }),
  x: finite,
  y: finite,
  scale: finite.positive().max(487.06),
  rotation: finite.min(-360).max(360),
  outline: z.boolean(),
});
const properties = z.strictObject({
  name: z.string().trim().min(1).max(128),
  type: z.enum(['sand', 'rock', 'stronghold', 'polar']),
  insetLine: z.enum(['none', 'solid', 'dashed']),
  decals: z.array(decal).max(128),
  appearance: z.array(contour).max(8).optional(),
  paintOrder: finite.optional(),
  border: z
    .strictObject({
      width: finite.min(0).max(50),
      linecap: z.enum(['round', 'square', 'butt']),
      linejoin: z.enum(['round', 'bevel', 'miter']),
    })
    .optional(),
});

/** Saved linework and properties own both the rendered map and its targeting geometry. */
export const BoardDefinition = z
  .strictObject({
    nodes: z.record(identity, point),
    edges: z.array(edge).max(1024),
    properties: z.record(z.string().min(1).max(12_000), properties),
  })
  .superRefine((board, ctx) => {
    const nodes = Object.entries(board.nodes),
      edges = new Set(board.edges.map((e) => e.id));
    if (nodes.length > 1024 || Object.keys(board.properties).length > 512) {
      ctx.addIssue({ code: 'custom', message: 'The board has too many points or territories' });
    }
    if (edges.size !== board.edges.length) {
      ctx.addIssue({ code: 'custom', message: 'Boundary identities must be unique' });
    }
    if (board.edges.some((e) => !board.nodes[e.a] || !board.nodes[e.b])) {
      ctx.addIssue({ code: 'custom', message: 'A boundary refers to a missing point' });
    }
    if (nodes.some(([, p]) => Math.hypot(p[0] - 243.53, p[1] - 243.53) > 242.51)) {
      ctx.addIssue({ code: 'custom', message: 'Points must stay inside the board circle' });
    }
    if (
      board.edges.some(
        (edge) =>
          board.nodes[edge.a] &&
          board.nodes[edge.b] &&
          Array.from({ length: edge.kind === 'line' ? 2 : 129 }, (_, index) =>
            at(board, edge, index / (edge.kind === 'line' ? 1 : 128))
          ).some((p) => !p.every(Number.isFinite) || Math.hypot(p[0] - 243.53, p[1] - 243.53) > 242.6)
      )
    ) {
      ctx.addIssue({ code: 'custom', message: 'Boundary curves must stay inside the board circle' });
    }
    const names = Object.values(board.properties).map((p) => p.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', message: 'Territory names must be unique' });
    }
    if (Object.values(board.properties).some((p) => new Set(p.decals.map((d) => d.id)).size !== p.decals.length)) {
      ctx.addIssue({ code: 'custom', message: 'Decal identities must be unique within a territory' });
    }
    if (new TextEncoder().encode(JSON.stringify(board)).length > 750_000) {
      ctx.addIssue({ code: 'custom', message: 'The board is too large to save' });
    }
  });
export const BoardAsset = z.strictObject({
  name: z.string().trim().min(1).max(128),
  about: z.string().trim(),
  board: BoardDefinition,
});
export type Board = z.infer<typeof BoardDefinition>;
export type Point = z.infer<typeof point>;
export type Edge = z.infer<typeof edge>;
export type Properties = z.infer<typeof properties>;
export type Decal = z.infer<typeof decal>;
export type ContourAnchor = z.infer<typeof anchor>;
export type AppearanceContour = z.infer<typeof contour>;
export type BoardAssetData = z.infer<typeof BoardAsset>;

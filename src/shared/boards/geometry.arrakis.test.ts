import { describe, expect, it } from 'vitest';

import reference from './arrakis.json';
import { arrakisBoard, blankBoard, at, connectPoint, contourPath, derive, movePoint, reconcile } from './geometry';
import { BoardAsset } from './schema';

describe('Editable Arrakis recreation', () => {
  it('recreates all source territories with their complete boundaries and holes', () => {
    const board = arrakisBoard();
    const result = derive(board);
    expect(result.unrecoveredSegments).toBe(0);
    expect(result.faces).toHaveLength(reference.shapes.length);
    expect(result.faces.map((face) => board.properties[face.key].id).sort()).toEqual(
      reference.shapes.map((shape) => shape.name.replaceAll('-', '_')).sort()
    );
    for (const face of result.faces) {
      const shape = reference.shapes.find(
        (shape) => shape.name.replaceAll('-', '_') === board.properties[face.key].id
      )!;
      expect(face.edges, shape.name).toEqual([...new Set(shape.edges)].sort());
      expect(face.area, shape.name).toBeGreaterThan(1);
    }
    const surrounded = result.faces.find((face) => board.properties[face.key].id === 'habbanya_ridge_flat')!;
    expect(surrounded.rings).toHaveLength(2);
  });

  it('keeps territory identities and inset geometry attached when a shared junction moves', () => {
    const original = arrakisBoard();
    const before = derive(original).faces;
    const next = movePoint(original, 'n335', [216, 84]);
    const after = derive(next).faces;
    const board = reconcile(next, original, before, after);
    expect(after).toHaveLength(42);
    expect(
      Object.values(board.properties)
        .map((p) => p.name)
        .sort()
    ).toEqual(
      Object.values(original.properties)
        .map((p) => p.name)
        .sort()
    );
    const carthag = Object.values(original.properties).find((p) => p.id === 'carthag')!;
    expect(contourPath(next, carthag.appearance![0])).not.toEqual(contourPath(original, carthag.appearance![0]));
    const polar = Object.values(original.properties).find((p) => p.id === 'polar_sink')!;
    expect(contourPath(next, polar.appearance![0])).toEqual(contourPath(original, polar.appearance![0]));
  });

  it('preserves imported inset contours when inserting a boundary point', () => {
    const original = arrakisBoard();
    const carthag = Object.values(original.properties).find((p) => p.id === 'carthag')!;
    const edge = original.edges.find((edge) => edge.id === 'n21:n335')!;
    const next = connectPoint(original, at(original, edge, 0.5), false, 0.5, edge.id).board;
    const committed = reconcile(next, original, derive(original).faces, derive(next).faces);
    const edited = Object.values(committed.properties).find((p) => p.id === 'carthag')!;
    for (let i = 0; i < carthag.appearance!.length; i++) {
      expect(contourPath(next, edited.appearance![i])).toEqual(contourPath(original, carthag.appearance![i]));
    }
    expect(derive(next).faces).toHaveLength(42);
  });

  it('keeps its complete geometry through a board draft round trip', () => {
    const original = arrakisBoard();
    const restored = JSON.parse(JSON.stringify(original));
    expect(derive(restored).faces.map((face) => face.path)).toEqual(derive(original).faces.map((face) => face.path));
    for (const p of Object.values(restored.properties) as (typeof original.properties)[string][]) {
      for (const contour of p.appearance || []) {
        expect(contourPath(restored, contour)).not.toBeNull();
      }
    }
    expect(
      Object.values(restored.properties).flatMap((p) => (p as (typeof original.properties)[string]).decals)
    ).toHaveLength(5);
  });

  it('preserves invalid authored names through topology reconciliation so saving still reports them', () => {
    const original = arrakisBoard();
    const properties = Object.values(original.properties);
    properties[0].name = '';
    properties[1].name = properties[2].name;
    const faces = derive(original).faces;
    const next = reconcile(original, original, faces, faces);
    expect(Object.values(next.properties).map((p) => p.name)).toEqual(properties.map((p) => p.name));
  });

  it('keeps authored collisions when inserting a point changes territory keys', () => {
    const original = arrakisBoard();
    Object.values(original.properties)[0].name = 'Rock outcroppings';
    Object.values(original.properties)[1].name = 'ROCK-OUTCROPPINGS';
    const edge = original.edges.find((e) => e.id === 'n0:n1')!;
    const next = connectPoint(original, at(original, edge, 0.5), false, 0.5, edge.id).board;
    const before = derive(original).faces;
    const after = derive(next).faces;
    expect(after.map((face) => face.key)).not.toEqual(before.map((face) => face.key));
    const reconciled = reconcile(next, original, before, after);
    expect(
      Object.values(reconciled.properties)
        .map((p) => p.name)
        .sort()
    ).toEqual(
      Object.values(original.properties)
        .map((p) => p.name)
        .sort()
    );
    expect(BoardAsset.safeParse({ name: 'Board', about: '', board: reconciled }).success).toBe(false);
  });

  it('gives split territories distinct names within the name limit', () => {
    const original = blankBoard();
    Object.values(original.properties)[0].name = 'A'.repeat(128);
    const next = { ...original, edges: [...original.edges, { id: 'cut', a: 'n', b: 's', kind: 'line' as const }] };
    const after = derive(next).faces;
    expect(after).toHaveLength(2);
    const board = reconcile(next, original, derive(original).faces, after);
    expect(Object.values(board.properties).map((p) => p.name)).toContain('A'.repeat(128));
    expect(BoardAsset.safeParse({ name: 'Board', about: '', board }).success).toBe(true);
  });
});

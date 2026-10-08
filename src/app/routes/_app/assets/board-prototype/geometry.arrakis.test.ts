import { describe, expect, it } from 'vitest';

import reference from './arrakis.fixture.json';
import { arrakisBoard, at, connectPoint, contourPath, derive, movePoint, reconcile } from './geometry';

describe('Editable Arrakis recreation', () => {
  it('recreates all source territories with their complete boundaries and holes', () => {
    const board = arrakisBoard();
    const result = derive(board);
    expect(result.unrecoveredSegments).toBe(0);
    expect(result.faces).toHaveLength(reference.shapes.length);
    expect(result.faces.map((face) => board.properties[face.key].name).sort()).toEqual(
      reference.shapes.map((shape) => shape.name).sort()
    );
    for (const face of result.faces) {
      const shape = reference.shapes.find((shape) => shape.name === board.properties[face.key].name)!;
      expect(face.edges, shape.name).toEqual([...new Set(shape.edges)].sort());
      expect(face.area, shape.name).toBeGreaterThan(1);
    }
    const surrounded = result.faces.find((face) => board.properties[face.key].name === 'habbanya-ridge-flat')!;
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
    const carthag = Object.values(original.properties).find((p) => p.name === 'carthag')!;
    expect(contourPath(next, carthag.appearance![0])).not.toEqual(contourPath(original, carthag.appearance![0]));
    const polar = Object.values(original.properties).find((p) => p.name === 'polar-sink')!;
    expect(contourPath(next, polar.appearance![0])).toEqual(contourPath(original, polar.appearance![0]));
  });

  it('preserves imported inset contours when inserting a boundary point', () => {
    const original = arrakisBoard();
    const carthag = Object.values(original.properties).find((p) => p.name === 'carthag')!;
    const edge = original.edges.find((edge) => edge.id === 'n21:n335')!;
    const next = connectPoint(original, at(original, edge, 0.5), false, 0.5, edge.id).board;
    const edited = Object.values(next.properties).find((p) => p.name === 'carthag')!;
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
});

import { BufferAttribute, BufferGeometry } from 'three';
// @ts-expect-error three ships no types for its renderer internals; this checks our patch to them
import Geometries from 'three/src/renderers/common/Geometries.js';
import { expect, test } from 'vitest';

/* A renderer's geometry component, with buffer uploads and frees recorded by attribute name. */
function geometries() {
  const names = new Map<BufferAttribute, string>();
  const freed = new Set<string>();
  const attributes = {
    update() {},
    delete(attribute: BufferAttribute) {
      freed.add(names.get(attribute) ?? 'unknown');
    },
  };
  const info = { memory: { geometries: 0 }, render: { calls: 0 } };
  return { component: new Geometries(attributes, info), names, freed };
}

/* What a mesh drawing the geometry with a material reading only the given attributes looks like. */
function drawn(geometry: BufferGeometry, read: string[]) {
  const attributes = read.map((name) => geometry.getAttribute(name));
  return { geometry, material: { wireframe: false }, getAttributes: () => attributes };
}

test('a disposed geometry frees what any of its materials uploaded, and not what another geometry shares', () => {
  const { component, names, freed } = geometries();
  const uv = new BufferAttribute(new Float32Array(8), 2);
  const plain = new BufferGeometry();
  const textured = new BufferGeometry();
  for (const [label, geometry] of [
    ['plain', plain],
    ['textured', textured],
  ] as const) {
    const position = new BufferAttribute(new Float32Array(12), 3);
    names.set(position, `${label} position`);
    geometry.setAttribute('position', position);
    geometry.setAttribute('uv', uv);
  }
  names.set(uv, 'shared uv');

  component.updateForRender(drawn(plain, ['position']));
  component.updateForRender(drawn(textured, ['position']));
  /* A later textured material uploads the uv the first one never read. */
  component.updateForRender(drawn(textured, ['position', 'uv']));

  plain.dispose();
  expect([...freed]).toEqual(['plain position']);

  freed.clear();
  textured.dispose();
  expect([...freed].sort()).toEqual(['shared uv', 'textured position']);
});

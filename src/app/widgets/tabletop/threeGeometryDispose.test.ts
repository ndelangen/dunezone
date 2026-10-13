import { BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute } from 'three';
// @ts-expect-error three ships no types for its renderer internals; this checks our patch to them
import Geometries from 'three/src/renderers/common/Geometries.js';
import { expect, test } from 'vitest';

type Attribute = BufferAttribute | InterleavedBufferAttribute;

/* A renderer's geometry component, with the attributes it frees recorded by name. */
function geometries() {
  const names = new Map<Attribute, string>();
  const freed = new Set<string>();
  const attributes = {
    update() {},
    delete(attribute: Attribute) {
      freed.add(names.get(attribute) ?? 'unknown');
    },
  };
  const info = { memory: { geometries: 0 }, render: { calls: 0 } };
  const component = new Geometries(attributes, info);
  /* What a mesh drawing the geometry with a material reading only the given attributes looks like. */
  const draw = (geometry: BufferGeometry, read: string[]) => {
    const drawn = read.map((name) => geometry.getAttribute(name));
    component.updateForRender({ geometry, material: { wireframe: false }, getAttributes: () => drawn });
  };
  /* The attributes freed when the geometry is disposed. */
  const dispose = (geometry: BufferGeometry) => {
    freed.clear();
    geometry.dispose();
    return [...freed].sort();
  };
  return { names, draw, dispose };
}

/* A geometry with its own position, named after it. */
function geometry(label: string, names: Map<Attribute, string>) {
  const result = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(12), 3);
  names.set(position, `${label} position`);
  result.setAttribute('position', position);
  return result;
}

test('a disposed geometry frees what any of its materials drew, and not what another geometry shares', () => {
  const { names, draw, dispose } = geometries();
  const uv = new BufferAttribute(new Float32Array(8), 2);
  names.set(uv, 'shared uv');
  const plain = geometry('plain', names);
  const textured = geometry('textured', names);
  plain.setAttribute('uv', uv);
  textured.setAttribute('uv', uv);

  draw(plain, ['position']);
  draw(textured, ['position']);
  /* A later textured material draws the uv the first one never read. */
  draw(textured, ['position', 'uv']);

  expect(dispose(plain)).toEqual(['plain position']);
  expect(dispose(textured)).toEqual(['shared uv', 'textured position']);
});

test('a buffer two geometries drew stays until the last of them is disposed', () => {
  const { names, draw, dispose } = geometries();
  const uv = new BufferAttribute(new Float32Array(8), 2);
  names.set(uv, 'shared uv');
  const first = geometry('first', names);
  const second = geometry('second', names);
  first.setAttribute('uv', uv);
  second.setAttribute('uv', uv);

  draw(first, ['position']);
  draw(first, ['position', 'uv']);
  draw(second, ['position', 'uv']);

  expect(dispose(first)).toEqual(['first position']);
  expect(dispose(second)).toEqual(['second position', 'shared uv']);
});

test('interleaved attributes sharing one buffer stay until no geometry draws that buffer', () => {
  const { names, draw, dispose } = geometries();
  const buffer = new InterleavedBuffer(new Float32Array(16), 4);
  const first = geometry('first', names);
  const second = geometry('second', names);
  const firstUv = new InterleavedBufferAttribute(buffer, 2, 0);
  const secondUv = new InterleavedBufferAttribute(buffer, 2, 2);
  names.set(firstUv, 'first uv');
  names.set(secondUv, 'second uv');
  first.setAttribute('uv', firstUv);
  second.setAttribute('uv', secondUv);

  draw(first, ['position', 'uv']);
  draw(second, ['position', 'uv']);

  expect(dispose(first)).toEqual(['first position']);
  expect(dispose(second)).toEqual(['second position', 'second uv']);
});

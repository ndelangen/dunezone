/* @vitest-environment jsdom */

import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import { publishingRectangleTokenFace } from '@shared/assets/fixtures/publishingRectangleTokenFace';
import { publishingTokenFace } from '@shared/assets/fixtures/publishingTokenFace';
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { CustomToken } from './Custom';
import { RectangleToken } from './Rectangle';

function parts(container: HTMLElement) {
  return [...container.querySelectorAll(COMPONENT_GEOMETRY_PROTOCOL.partSelector)].map((element) =>
    element.getAttribute(COMPONENT_GEOMETRY_PROTOCOL.partAttribute)
  );
}

it('keeps token targets semantic and omits text and rings that no longer render', () => {
  const { container, rerender } = render(<CustomToken {...publishingTokenFace} circle top="Top" bottom="Bottom" />);
  expect(parts(container)).toEqual(['symbol', 'ring', 'top-text', 'bottom-text']);
  rerender(<CustomToken {...publishingTokenFace} circle={false} top="" bottom="" />);
  expect(parts(container)).toEqual(['symbol']);
});

it('draws a pointer face as one symbol on a teardrop ring, never a label', () => {
  const { container } = render(
    <CustomToken {...publishingTokenFace} shape="pointer" circle top="HMS" bottom="Hunter" />
  );
  expect(parts(container)).toEqual(['symbol', 'ring']);
  /* The ring follows the teardrop rather than a circle, so the pointer draws it as a path. */
  expect(container.querySelector('[data-component-part="ring"] circle')).toBeNull();
  expect(container.querySelector('[data-component-part="ring"] path')).not.toBeNull();
});

it('names rectangle collections without binding individual elements to their positions', () => {
  const { container, rerender } = render(<RectangleToken {...publishingRectangleTokenFace} />);
  expect(parts(container)).toEqual(['decals', 'body', 'ring']);
  rerender(
    <RectangleToken
      {...publishingRectangleTokenFace}
      texts={publishingRectangleTokenFace.texts.map((text) => ({ ...text, opacity: 0 }))}
      decals={publishingRectangleTokenFace.decals.map((decal) => ({ ...decal, opacity: 0 }))}
      ring={false}
    />
  );
  expect(parts(container)).toEqual([]);
  rerender(<RectangleToken {...publishingRectangleTokenFace} texts={[]} decals={[]} ring={false} />);
  expect(parts(container)).toEqual([]);
});

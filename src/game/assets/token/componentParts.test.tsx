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

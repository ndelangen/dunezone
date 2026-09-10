/* @vitest-environment jsdom */

import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import { publishingTreacheryCard } from '@shared/assets/fixtures/publishingTreacheryCard';
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { TreacheryCard } from './Treachery';

it('exposes the maintained Card anatomy only while each part has content', () => {
  const { container, rerender } = render(<TreacheryCard {...publishingTreacheryCard} />);
  const parts = () =>
    [...container.querySelectorAll(COMPONENT_GEOMETRY_PROTOCOL.partSelector)].map((element) =>
      element.getAttribute(COMPONENT_GEOMETRY_PROTOCOL.partAttribute)
    );
  expect(parts()).toEqual(['decals', 'head', 'icon', 'name', 'type', 'body']);
  rerender(<TreacheryCard {...publishingTreacheryCard} name="" subName="" text="" decals={[]} />);
  expect(parts()).toEqual(['head', 'icon']);
});

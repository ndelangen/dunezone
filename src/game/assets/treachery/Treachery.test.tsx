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

it('keeps standard category styling when a saved card carries independent symbol adjustments', () => {
  const { container } = render(
    <TreacheryCard
      {...publishingTreacheryCard}
      head={{ ...publishingTreacheryCard.head, influence: 0, image: '/image/texture/001.jpg' }}
      icon={[{ ...publishingTreacheryCard.icon[0], colors: ['#ff0000', '#00ff00'] }, publishingTreacheryCard.icon[1]]}
      iconScale={2}
      iconOffset={[80, 80]}
      iconInvert
      iconOpacity={0}
    />
  );
  expect(container.querySelector('rect[fill="#ff0000"]')).toBeNull();
  const symbol = container.querySelector<HTMLImageElement>(`img[src="${publishingTreacheryCard.icon[1]}"]`)!;
  expect(symbol.style.width).toBe('85px');
  expect(symbol.style.marginLeft).toBe('0px');
  expect(symbol.style.opacity).toBe('1');
  expect(symbol.style.filter).toBe('');
});

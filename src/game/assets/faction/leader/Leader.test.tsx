// @vitest-environment jsdom

import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it } from 'vitest';

import { LeaderToken } from './Leader';

it('exposes one visible semantic target per rendered Leader part', () => {
  const props = {
    name: 'Duncan Idaho',
    strength: '2',
    image: '/image/leader/official/duncan.png',
    logo: '/vector/logo/atreides.svg',
    background: {
      image: '/image/texture/021.jpg',
      colors: ['#3e6337', '#132810'],
      invert: false,
      definition: 0,
      influence: 0,
    },
  } satisfies ComponentProps<typeof LeaderToken>;
  const { container, rerender } = render(<LeaderToken {...props} />);
  const parts = () =>
    [...container.querySelectorAll(COMPONENT_GEOMETRY_PROTOCOL.partSelector)].map((element) =>
      element.getAttribute(COMPONENT_GEOMETRY_PROTOCOL.partAttribute)
    );
  expect(parts()).toEqual(['portrait', 'strength', 'name', 'faction-emblem']);
  expect(container.querySelectorAll('defs [data-component-part]')).toHaveLength(0);
  rerender(<LeaderToken {...props} name="" strength="" />);
  expect(parts()).toEqual(['portrait', 'faction-emblem']);
  rerender(<LeaderToken {...props} strength={0} />);
  expect(parts()).toEqual(['portrait', 'strength', 'name', 'faction-emblem']);
});

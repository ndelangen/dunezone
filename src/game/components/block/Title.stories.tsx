import preview from '@sb/preview';
import { Fragment } from 'react';

import { Title } from './Title';

const meta = preview.meta({
  component: Title,
  args: {
    color: 'rgba(255,0,0)',
    size: 'large',
  },
});

export const Default = meta.story({
  args: {
    color: 'rgba(255,0,0)',
    children: 'Faction advantages',
  },
});

export const DarkBackground = meta.story({
  args: {
    color: 'rgba(80,100,15)',
    children: 'Faction advantages',
  },
});

export const LightBackground = meta.story({
  args: {
    color: 'rgba(255,200,15)',
    children: 'Faction advantages',
  },
});

export const ContrastPalette = meta.story({
  args: {
    color: '#000000',
    children: 'Faction advantages',
  },
  render: ({ children }) => (
    <Fragment>
      <Title color="#000000">{children}</Title>
      <Title color="#ffffff">{children}</Title>
      <Title color="rgba(100, 100, 100, 0.7)">{children}</Title>
      <Title color="rgb(100, 100, 100)">{children}</Title>
      <Title color="rgb(50, 200, 190)">{children}</Title>
      <Title color="rgb(255, 0, 255)">{children}</Title>
    </Fragment>
  ),
});

export const Sizes = meta.story({
  args: {
    color: '#000000',
    children: 'Faction advantages',
  },
  render: ({ children, color }) => (
    <Fragment>
      <Title color={color} size="large">
        {children}
      </Title>
      <hr />
      <Title color={color} size="medium">
        {children}
      </Title>
      <hr />
      <Title color={color} size="small">
        {children}
      </Title>
    </Fragment>
  ),
});

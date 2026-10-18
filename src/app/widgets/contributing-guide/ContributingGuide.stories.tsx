import { Text } from '@mantine/core';
import preview from '@sb/preview';
import type { ComponentProps } from 'react';
import { fn } from 'storybook/test';

import { ContributingGuide } from './ContributingGuide';

const meta = preview.meta({
  component: ContributingGuide,
  parameters: { layout: 'padded' },
  args: {
    current: 'overview' as const,
    onPageChange: fn<ComponentProps<typeof ContributingGuide>['onPageChange']>(),
    children: <Text>Guide content supplied by the page.</Text>,
  },
});

export const Overview = meta.story({});

export const Glossary = meta.story({ args: { current: 'glossary' } });

export const Narrow = meta.story({ globals: { viewport: { value: 'contentNarrow' } } });

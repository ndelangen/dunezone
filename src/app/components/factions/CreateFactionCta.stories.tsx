import preview from '@sb/preview';

import { CreateFactionCta } from './CreateFactionCta';

const meta = preview.meta({
  component: CreateFactionCta,
  parameters: { layout: 'centered' },
});

export const Default = meta.story({});

export const CompactAction = meta.story({
  args: { children: 'Start creating', size: 'sm', withArrow: true },
});

export const CatalogueAttention = meta.story({
  args: { attention: true },
});

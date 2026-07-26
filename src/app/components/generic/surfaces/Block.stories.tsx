import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { Block, BlockLink } from './Block';

const meta = preview.meta({
  component: Block,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    children: <p>Block content</p>,
  },
});

export const AsLink = meta.story({
  render: () => (
    <BlockLink to="/profiles" params={{}} search={{}}>
      <p>Block styled as a link</p>
    </BlockLink>
  ),
});

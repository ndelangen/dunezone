import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { Toolbar } from './Toolbar';
import { ToolbarSearchField } from './ToolbarSearchField';

const meta = preview.meta({
  component: ToolbarSearchField,
  args: {
    value: 'spice',
    onValueChange: () => {},
    placeholder: 'Filter…',
    'aria-label': 'Filter factions',
  },
  parameters: {
    ...legacyStoryParameters,
    layout: 'padded',
  },
});

export const Standalone = meta.story({});

export const InToolbar = meta.story({
  render: (args) => (
    <Toolbar>
      <Toolbar.Left>
        <button type="button">Create faction</button>
        <ToolbarSearchField {...args} />
      </Toolbar.Left>
      <Toolbar.Right>
        <span style={{ fontSize: '0.9rem', opacity: 0.85 }}>12 factions</span>
      </Toolbar.Right>
    </Toolbar>
  ),
});

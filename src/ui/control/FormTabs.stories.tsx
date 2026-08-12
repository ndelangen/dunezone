import preview from '@sb/preview';

import { FormTabs, FormTabsPanel } from './FormTabs';
import type { FormTabsItem } from './FormTabs';

const items: FormTabsItem[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'details', label: 'Details' },
  { value: 'settings', label: 'Settings', disabled: true },
];

const meta = preview.meta({
  component: FormTabs,
  args: {
    value: 'overview',
    onValueChange: () => {},
    items,
    children: (
      <>
        <FormTabsPanel value="overview">
          <p>Overview content.</p>
        </FormTabsPanel>
        <FormTabsPanel value="details">
          <p>Details content.</p>
        </FormTabsPanel>
        <FormTabsPanel value="settings">
          <p>Settings are disabled in this example.</p>
        </FormTabsPanel>
      </>
    ),
  },
});

export const Default = meta.story({});

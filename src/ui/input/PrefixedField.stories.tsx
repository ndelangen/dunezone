import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { PrefixedField } from './PrefixedField';
import { TextField } from './TextField';

const meta = preview.meta({
  component: PrefixedField,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    prefix: <span>https://</span>,
    suffix: <span>.example.com</span>,
    children: <TextField appearance="embedded" placeholder="subdomain" />,
  },
});

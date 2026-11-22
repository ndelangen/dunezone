import { Box } from '@mantine/core';
import preview from '@sb/preview';

import { Disclosure } from './Disclosure';

const meta = preview.meta({ component: Disclosure, parameters: { layout: 'padded' } });

/** Shut, it is its title on one line, and the box around it is the toggle. */
export const Default = meta.story({
  args: { title: 'From Original, the parent variant. Read-only here.', children: 'Each player starts with 10 spice.' },
  decorators: [
    (Story) => (
      <Box pos="relative" p="sm">
        <Story />
      </Box>
    ),
  ],
});

import { Button, Text } from '@mantine/core';
import preview from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { SheetPopover, TouchSurface } from './TouchSheet';

/* A chooser that opens as a popover with a mouse and as a sheet from the bottom on a phone. */
function Chooser() {
  const [opened, setOpened] = useState(true);
  return (
    <SheetPopover opened={opened} onChange={setOpened} position="bottom" withinPortal shadow="md" width={240}>
      <SheetPopover.Target>
        <Button onClick={() => setOpened((was) => !was)}>Choose a stronghold</Button>
      </SheetPopover.Target>
      <SheetPopover.Dropdown label="Choose a stronghold">
        <Text size="sm">Arrakeen, Carthag, Sietch Tabr, Habbanya Sietch or Tuek’s Sietch.</Text>
      </SheetPopover.Dropdown>
    </SheetPopover>
  );
}

const meta = preview.meta({
  title: 'Touch Sheet',
  component: SheetPopover,
  parameters: { layout: 'centered' },
});

/** With a mouse the dropdown is a popover beside its target. */
export const Popover = meta.story({
  render: () => <Chooser />,
  play: async () => {
    await expect(await within(document.body).findByText(/Sietch Tabr/)).toBeVisible();
  },
});

/** On a phone the dropdown is a sheet from the bottom, with a thumb-sized Close button. */
export const Sheet = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  render: () => (
    <TouchSurface>
      <Chooser />
    </TouchSurface>
  ),
  play: async () => {
    const body = within(document.body);
    await expect(await body.findByRole('dialog')).toBeVisible();
    await userEvent.click(body.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(body.queryByText(/Sietch Tabr/)).toBeNull());
  },
});

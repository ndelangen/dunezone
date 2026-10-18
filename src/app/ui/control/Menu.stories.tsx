import { Menu } from '@mantine/core';
import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { EllipsisVertical, Link2Off, Pencil, Star } from 'lucide-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { IconAction } from './IconAction';

const meta = preview.meta({
  component: Menu,
  parameters: { layout: 'centered' },
  args: { position: 'bottom-end', shadow: 'md', withinPortal: true },
});

const trigger = (
  <Menu.Target>
    <IconAction
      label="Actions for House Atreides"
      emphasis="standard"
      intent="neutral"
      size="sm"
      icon={<EllipsisVertical size={15} aria-hidden />}
    />
  </Menu.Target>
);

/** Opens the story's menu and returns the page once its dropdown is showing. */
async function openMenu(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const target = page.getByRole('button', { name: 'Actions for House Atreides' });
  await userEvent.click(target);
  await expect(target).toHaveAttribute('aria-haspopup', 'menu');
  await waitForFrame(() => expect(finishTransitions(page.getByRole('menu'))).toBeVisible());
  return page;
}

/** One destructive choice, the shape a list item's menu usually takes. `color="red"` is how a destructive choice reads. */
export const Default = meta.story({
  render: (args) => (
    <Menu {...args}>
      {trigger}
      <Menu.Dropdown>
        <Menu.Item color="red" leftSection={<Link2Off size={15} aria-hidden />}>
          Remove from Dreamrules
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const page = await openMenu(canvasElement);
    await expect(page.getByRole('menuitem', { name: 'Remove from Dreamrules' })).toBeVisible();
  },
});

/** Several choices, with the destructive one set apart and a divider above it. */
export const SeveralChoices = meta.story({
  render: (args) => (
    <Menu {...args}>
      {trigger}
      <Menu.Dropdown>
        <Menu.Item leftSection={<Star size={15} aria-hidden />}>Feature on the page</Menu.Item>
        <Menu.Item leftSection={<Pencil size={15} aria-hidden />}>Edit this faction</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<Link2Off size={15} aria-hidden />}>
          Remove from Dreamrules
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const items = within((await openMenu(canvasElement)).getByRole('menu')).getAllByRole('menuitem');
    await expect(items.map((item) => item.textContent)).toEqual([
      'Feature on the page',
      'Edit this faction',
      'Remove from Dreamrules',
    ]);
    /* Mantine's divider carries no role, so it shows as the wider gap it opens above the destructive choice. */
    const [feature, edit, remove] = items.map((item) => item.getBoundingClientRect());
    await expect(remove.top - edit.bottom).toBeGreaterThan(edit.top - feature.bottom);
  },
});

/** A choice that is present but unavailable stays visible, so its absence is never a mystery. */
export const DisabledChoice = meta.story({
  render: (args) => (
    <Menu {...args}>
      {trigger}
      <Menu.Dropdown>
        <Menu.Item leftSection={<Pencil size={15} aria-hidden />}>Edit this faction</Menu.Item>
        <Menu.Item disabled color="red" leftSection={<Link2Off size={15} aria-hidden />}>
          Remove from Dreamrules
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const item = (await openMenu(canvasElement)).getByRole('menuitem', { name: 'Remove from Dreamrules' });
    await expect(item).toBeVisible();
    await expect(item).toBeDisabled();
  },
});

/** A labelled group, for a menu long enough to need sections. */
export const WithLabel = meta.story({
  render: (args) => (
    <Menu {...args}>
      {trigger}
      <Menu.Dropdown>
        <Menu.Label>This ruleset</Menu.Label>
        <Menu.Item color="red" leftSection={<Link2Off size={15} aria-hidden />}>
          Remove from Dreamrules
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const menu = within((await openMenu(canvasElement)).getByRole('menu'));
    const label = menu.getByText('This ruleset');
    await expect(label).toBeVisible();
    const item = menu.getByRole('menuitem', { name: 'Remove from Dreamrules' });
    await expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(item.getBoundingClientRect().top);
  },
});

/**
 * The runner withholds animation frames for seconds while the page is busy, and a Mantine menu mounts its dropdown from inside one.
 * This story holds every frame back by a second and a half around the open, longer than Testing Library's default second, and expects the item all the same.
 * It is the guard for the suite-wide wait in `.storybook/storyWaits.ts` (https://github.com/ndelangen/dunezone/issues/1248): with that bound removed it fails naming the item.
 * The hold sits above the frame recorder, so a failure here reports the runner's own lag, not the hold.
 * The wait finishes the dropdown's fade, so it waits on the held frames that mount and open the dropdown and not on the frames that draw the fade (https://github.com/ndelangen/dunezone/issues/1303).
 */
export const OpensWhileFramesAreWithheld = meta.story({
  render: Default.input.render,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const view = canvasElement.ownerDocument.defaultView!;
    const requestFrame = view.requestAnimationFrame.bind(view);
    view.requestAnimationFrame = (callback: FrameRequestCallback) =>
      view.setTimeout(() => requestFrame(callback), 1500) as unknown as number;
    try {
      await userEvent.click(page.getByRole('button', { name: 'Actions for House Atreides' }));
      await waitFor(() =>
        expect(finishTransitions(page.getByRole('menuitem', { name: 'Remove from Dreamrules' }))).toBeVisible()
      );
    } finally {
      view.requestAnimationFrame = requestFrame;
    }
  },
});

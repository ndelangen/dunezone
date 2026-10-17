import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { Square } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';

import { IconAction } from '../control/IconAction';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';
import { Toolbar } from './Toolbar';

/* Control-shaped stand-ins. A toolbar does not care what its controls are, only where they go. */
const control = <SurfaceFiller height={36} width={36} />;
/* A real action where a story counts or opens them, since a stand-in has no name to find. */
const action = (label: string) => (
  <IconAction label={label} emphasis="standard" intent="neutral" size="lg" icon={<Square size={17} aria-hidden />} />
);
const wideControl = <SurfaceFiller height={36} width={120} />;

const meta = preview.meta({
  component: Toolbar,
  parameters: { layout: 'padded' },
});

/** All three positions: what leads, what labels, what acts. */
export const Default = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left">{control}</Toolbar.Left>,
      <Toolbar.Center key="center">{wideControl}</Toolbar.Center>,
      <Toolbar.Right key="right">
        {control}
        {control}
      </Toolbar.Right>,
    ],
  },
});

/** The common shape: navigation on one edge, actions on the other, nothing between. */
export const LeftAndRight = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left">{control}</Toolbar.Left>,
      <Toolbar.Right key="right">{wideControl}</Toolbar.Right>,
    ],
  },
});

/** Centre alone stays centred, because the empty edges still claim their share. */
export const CenterOnly = meta.story({
  args: {
    children: [<Toolbar.Center key="center">{wideControl}</Toolbar.Center>],
  },
  play: async ({ canvasElement }) => {
    const filler = canvasElement.querySelector('[aria-hidden]')!;
    /* The filler sits in the centre slot, inside the toolbar's row. */
    const toolbar = filler.parentElement!.parentElement!.getBoundingClientRect();
    const centre = filler.getBoundingClientRect();
    await expect(Math.abs(centre.left + centre.width / 2 - (toolbar.left + toolbar.width / 2))).toBeLessThanOrEqual(1);
  },
});

/** Runs of actions stand in the kit's order whatever order the page hands them over in, with a wider gap between kinds and one thin divider before commit: content, access, discard, then commit at the edge. */
export const Clusters = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left" label="Navigation">
        {control}
      </Toolbar.Left>,
      <Toolbar.Right key="right" label="Actions">
        <Toolbar.Cluster kind="commit">{action('Save')}</Toolbar.Cluster>
        <Toolbar.Cluster kind="discard">{action('Delete')}</Toolbar.Cluster>
        <Toolbar.Cluster kind="content">
          {action('Create')}
          {action('Open')}
        </Toolbar.Cluster>
        <Toolbar.Cluster kind="access">{action('Assign')}</Toolbar.Cluster>
      </Toolbar.Right>,
    ],
  },
  play: async ({ canvasElement }) => {
    const actions = within(canvasElement).getByRole('group', { name: 'Actions' });
    await expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Create', 'Open', 'Assign', 'Delete', 'Save']);
  },
});

/**
 * Too many actions for a phone: the band stays one row, and whole runs fold into More actions before the commit run, the rarest first.
 * Opening the menu shows the folded runs as the same tiles.
 */
export const FoldsWhenCrowded = meta.story({
  decorators: [
    (Story) => (
      <Box w={320}>
        <Story />
      </Box>
    ),
  ],
  args: {
    children: [
      <Toolbar.Left key="left" label="Navigation">
        {action('Back')}
        {action('Edit')}
      </Toolbar.Left>,
      <Toolbar.Right key="right" label="Actions">
        <Toolbar.Cluster kind="content">
          {action('Create')}
          {action('Open')}
        </Toolbar.Cluster>
        <Toolbar.Cluster kind="access">{action('Assign')}</Toolbar.Cluster>
        <Toolbar.Cluster kind="discard">
          {action('Reset')}
          {action('Delete')}
        </Toolbar.Cluster>
        <Toolbar.Cluster kind="commit">{action('Save')}</Toolbar.Cluster>
      </Toolbar.Right>,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actions = canvas.getByRole('group', { name: 'Actions' });
    await expect(canvas.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    /* One row: the edge is no taller than one tile. */
    await expect(actions.getBoundingClientRect().height).toBeLessThanOrEqual(40);
    await expect(canvas.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'More actions' }));
    const menu = await waitForFrame(() =>
      within(canvasElement.ownerDocument.body).getByRole('group', { name: 'More actions' })
    );
    /* The popover mounts transparent and fades in, so the check finishes the fade rather than waiting for the frames that draw it. */
    await waitForFrame(() =>
      expect(finishTransitions(within(menu).getByRole('button', { name: 'Delete' }))).toBeVisible()
    );
  },
});

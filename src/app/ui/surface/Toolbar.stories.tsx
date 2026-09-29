import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { Square } from 'lucide-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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
});

/** A single edge, for a page whose toolbar only goes back. */
export const LeftOnly = meta.story({
  args: {
    children: [<Toolbar.Left key="left">{control}</Toolbar.Left>],
  },
});

/** A crowded edge keeps its controls on one line. */
export const ManyControls = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left">
        {control}
        {control}
      </Toolbar.Left>,
      <Toolbar.Right key="right">
        {control}
        {control}
        {control}
        {wideControl}
      </Toolbar.Right>,
    ],
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
        <Toolbar.Cluster kind="commit">{control}</Toolbar.Cluster>
        <Toolbar.Cluster kind="discard">{control}</Toolbar.Cluster>
        <Toolbar.Cluster kind="content">
          {control}
          {control}
        </Toolbar.Cluster>
        <Toolbar.Cluster kind="access">{control}</Toolbar.Cluster>
      </Toolbar.Right>,
    ],
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
    const menu = await within(canvasElement.ownerDocument.body).findByRole('group', { name: 'More actions' });
    await waitFor(() => expect(within(menu).getByRole('button', { name: 'Delete' })).toBeVisible());
  },
});

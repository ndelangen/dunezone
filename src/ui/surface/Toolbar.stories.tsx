import preview from '@sb/preview';

import { SurfaceFiller } from './SurfaceFiller.stories.fixture';
import { Toolbar } from './Toolbar';

/* Control-shaped stand-ins. A toolbar does not care what its controls are, only where they go. */
const control = <SurfaceFiller height={36} width={36} />;
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

/** A crowded edge keeps its controls on one line and lets the band grow instead. */
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

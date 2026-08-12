import preview from '@sb/preview';
import { LayoutSlotPlaceholder } from '@ui/layout/LayoutSlotPlaceholder.stories.fixture';
import { SurfaceFiller } from '@ui/surface/SurfaceFiller.stories.fixture';
import { Toolbar } from '@ui/surface/Toolbar';

import { PageLayout } from './PageLayout';

/* The toolbar slot adds no chrome of its own, so an honest usage passes a real Toolbar. */
const toolbar = (
  <Toolbar>
    <Toolbar.Left>
      <SurfaceFiller height={36} width={36} />
    </Toolbar.Left>
    <Toolbar.Right>
      <SurfaceFiller height={36} width={36} />
      <SurfaceFiller height={36} width={36} />
    </Toolbar.Right>
  </Toolbar>
);

const meta = preview.meta({
  component: PageLayout,
  parameters: { layout: 'fullscreen' },
  args: {
    header: <LayoutSlotPlaceholder name="header" minHeight={120} />,
    toolbar,
    children: <LayoutSlotPlaceholder name="content" minHeight={320} />,
  },
});

/** Every terminal route renders this: hero header, optional toolbar band, then the content. */
export const Default = meta.story({});

/** `compact` shrinks the hero for content-heavy detail pages. */
export const CompactHeader = meta.story({
  args: { headerSize: 'compact' },
});

/** Without a toolbar the content follows the hero directly. */
export const NoToolbar = meta.story({
  args: { toolbar: undefined },
});

/** Omitting the header entirely marks the page as intentionally compact. */
export const NoHeader = meta.story({
  args: { header: undefined, toolbar: undefined },
});

import preview from '@sb/preview';
import { Toolbar } from '@ui/surface/Toolbar';

import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';
import { PageLayout } from './PageLayout';

/**
 * Stands in for the shell's frame. `PageLayout` is `display: contents`, so its children join _this_
 * grid rather than one of its own — which is why it renders as unstyled boxes anywhere else. In the
 * application that frame is `AppHeader`, and it is also what reads `data-page-layout-*` to size the
 * artwork band; that negotiation belongs to `Shell/AppHeader`'s stories, not here.
 */
function ShellFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateAreas: '"hero" "content"',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 40,
        padding: 20,
        maxWidth: 1200,
        marginInline: 'auto',
      }}
    >
      <div
        aria-hidden
        style={{
          gridArea: 'hero',
          minHeight: 180,
          borderRadius: 6,
          background: 'linear-gradient(180deg, rgba(120,90,50,0.55), rgba(40,30,20,0.75))',
        }}
      />
      {children}
    </div>
  );
}

const meta = preview.meta({
  component: PageLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "The frame every terminal route composes: a header that overlays the shell's artwork band, an optional toolbar, and the content. It claims grid areas from its parent rather than creating any, so these stories supply a stand-in frame — the band behind the header here is a placeholder, not the real one.",
      },
    },
  },
  args: {
    header: <LayoutSlotPlaceholder name="header slot" minHeight={0} />,
    children: <LayoutSlotPlaceholder name="children slot" minHeight={320} />,
  },
  argTypes: {
    header: { control: false },
    toolbar: { control: false },
    children: { control: false },
  },
  decorators: [
    (Story) => (
      <ShellFrame>
        <Story />
      </ShellFrame>
    ),
  ],
});

/** The header sits in the band's row, aligned to its lower edge. */
export const WithHeader = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

/** `headerSize="compact"` gives the header less of the row, for content-heavy detail pages. */
export const CompactHeader = meta.story({
  args: { headerSize: 'compact' },
  globals: { viewport: { value: 'appDesktop' } },
});

/**
 * Omitting `header` is what marks a page intentionally compact — it sets
 * `data-page-layout-compact`, which the real shell frame reads to collapse the band.
 */
export const NoHeader = meta.story({
  args: { header: undefined },
  globals: { viewport: { value: 'appDesktop' } },
});

/**
 * The toolbar slot adds nothing around what it is given, so anything passed brings its own pane —
 * `Toolbar` is a surface and does.
 */
export const WithToolbar = meta.story({
  args: {
    toolbar: (
      <Toolbar>
        <Toolbar.Left>
          <LayoutSlotPlaceholder name="toolbar controls" minHeight={0} />
        </Toolbar.Left>
      </Toolbar>
    ),
  },
  globals: { viewport: { value: 'appDesktop' } },
});

export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});

import preview from '@sb/preview';
import type { CSSProperties, ReactNode } from 'react';
import { expect, waitFor } from 'storybook/test';

import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';
import { PageLayout } from './PageLayout';

/**
 * Stands in for the shell's frame.
 * `PageLayout` is `display: contents`, so its children join _this_ grid rather than one of its own, which is why it renders as unstyled boxes anywhere else.
 * In the application that frame is
 * `AppHeader`, and it is also what reads `data-page-layout-*` to size the artwork band;
 * that negotiation belongs to
 * `Shell/AppHeader`'s stories, not here.
 */
function ShellFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={
        {
          '--app-shell-inline-gutter': '20px',
          display: 'grid',
          gridTemplateAreas: '"hero" "content"',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 40,
          padding: 20,
          maxWidth: 1200,
          marginInline: 'auto',
        } as CSSProperties
      }
    >
      <div aria-hidden style={{ gridArea: 'hero', minHeight: 180 }} />
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
          "The frame every terminal route composes: a header that overlays the shell's artwork band, an optional toolbar, and the content. It claims grid areas from its parent rather than creating any, so these stories reserve unpainted shell grid rows without imitating the application artwork.",
      },
    },
  },
  decorators: [
    (Story) => (
      <ShellFrame>
        <Story />
      </ShellFrame>
    ),
  ],
});

const headerSlot = <LayoutSlotPlaceholder name="header slot" minHeight={0} />;
const contentSlot = <LayoutSlotPlaceholder name="children slot" minHeight={320} />;

/** The header sits in the band's row, aligned to its lower edge. */
export const WithHeader = meta.story({
  render: () => (
    <PageLayout>
      <PageLayout.Header>{headerSlot}</PageLayout.Header>
      <PageLayout.Content>{contentSlot}</PageLayout.Content>
    </PageLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
});

/** `size="compact"` gives the header less of the row, for content-heavy detail pages. */
export const CompactHeader = meta.story({
  render: () => (
    <PageLayout>
      <PageLayout.Header size="compact">{headerSlot}</PageLayout.Header>
      <PageLayout.Content>{contentSlot}</PageLayout.Content>
    </PageLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
});

/**
 * Omitting the `Header` slot is what marks a page intentionally compact;
 * it sets `data-page-layout-compact`, which the real shell frame reads to collapse the band.
 */
export const NoHeader = meta.story({
  render: () => (
    <PageLayout>
      <PageLayout.Content>{contentSlot}</PageLayout.Content>
    </PageLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
});

/**
 * The toolbar slot adds nothing around what it is given.
 */
export const WithToolbar = meta.story({
  render: () => (
    <PageLayout>
      <PageLayout.Header>{headerSlot}</PageLayout.Header>
      <PageLayout.Toolbar>
        <LayoutSlotPlaceholder name="toolbar slot" minHeight={72} />
      </PageLayout.Toolbar>
      <PageLayout.Content>{contentSlot}</PageLayout.Content>
    </PageLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
});

/**
 * The header and toolbar keep the shell's normal measure.
 * Only the content reaches from one shell gutter to the other.
 */
export const ViewportContent = meta.story({
  render: () => (
    <PageLayout>
      <PageLayout.Header>{headerSlot}</PageLayout.Header>
      <PageLayout.Toolbar>
        <LayoutSlotPlaceholder name="toolbar slot" minHeight={72} />
      </PageLayout.Toolbar>
      <PageLayout.Content width="viewport">
        <LayoutSlotPlaceholder name="content slot" minHeight={420} />
      </PageLayout.Content>
    </PageLayout>
  ),
  globals: { viewport: { value: 'appLarge' } },
  play: async ({ canvasElement }) => {
    const toolbar = canvasElement.querySelector<HTMLElement>('[data-page-layout-toolbar]');
    const content = canvasElement.querySelector<HTMLElement>('[data-page-layout-content]');

    await waitFor(() => {
      expect(toolbar).not.toBeNull();
      expect(content).not.toBeNull();

      const toolbarRect = toolbar?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      const viewportWidth = canvasElement.ownerDocument.documentElement.clientWidth;

      expect(contentRect?.width).toBeCloseTo(viewportWidth - 40, 0);
      expect(contentRect?.width).toBeGreaterThan(toolbarRect?.width ?? Number.POSITIVE_INFINITY);
      expect(contentRect?.left).toBeCloseTo(20, 0);
      expect(contentRect?.right).toBeCloseTo(viewportWidth - 20, 0);
    });
  },
});

export const Mobile = meta.story({
  render: () => (
    <PageLayout>
      <PageLayout.Header>{headerSlot}</PageLayout.Header>
      <PageLayout.Content>{contentSlot}</PageLayout.Content>
    </PageLayout>
  ),
  globals: { viewport: { value: 'appMobile' } },
});

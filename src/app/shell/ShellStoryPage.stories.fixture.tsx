import { Button } from '@mantine/core';
import { PageTitle } from '@ui/block/PageTitle';
import { LayoutSlotPlaceholder } from '@ui/layout/LayoutSlotPlaceholder.stories.fixture';
import { PageLayout } from '@ui/layout/PageLayout';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/* The real document stylesheet, as a string, so a story can carry it for its own lifetime instead
   of importing it and leaving the desert backdrop behind every other story in the preview. */
import pageStylesheet from '../styles/page.css?inline';

/**
 * Applies `page.css`, the document background whose position tracks `--scroll-pct`, for as long as this is mounted, and removes it on unmount so it cannot follow the viewer to the next story.
 */
export function ShellPageBackdrop({ children }: { children: ReactNode }) {
  useEffect(() => {
    const element = document.createElement('style');
    element.dataset.storyBackdrop = '';
    element.textContent = pageStylesheet;
    document.head.append(element);

    return () => {
      element.remove();
    };
  }, []);

  return children;
}

/**
 * Stands in for a route: a `PageLayout` holding labelled slot placeholders instead of page content, so nothing here can be mistaken for the real product.
 * Which slots are filled is the only variable that matters to the shell;
 * it is what sets the band's height.
 */
function ShellStoryPage({ headerSize, height }: { headerSize?: 'default' | 'compact'; height?: 'viewport' }) {
  return (
    <PageLayout height={height}>
      {headerSize && (
        <PageLayout.Header size={headerSize}>
          <LayoutSlotPlaceholder name="header slot" tone="header" minHeight={0} />
        </PageLayout.Header>
      )}
      {height === 'viewport' && (
        <PageLayout.Toolbar>
          <LayoutSlotPlaceholder name="toolbar slot" tone="toolbar" minHeight={64} />
        </PageLayout.Toolbar>
      )}
      <PageLayout.Content width={height === 'viewport' ? 'viewport' : undefined}>
        <LayoutSlotPlaceholder name="children slot" tone="primary" minHeight={1400} />
      </PageLayout.Content>
    </PageLayout>
  );
}

/** A fullscreen workspace with its own scroller and an exit to an ordinary document page. */
export function FullscreenShellPage() {
  const [fullscreen, setFullscreen] = useState(true);

  return (
    <PageLayout height={fullscreen ? 'fullscreen' : 'document'}>
      <PageLayout.Header size="compact">
        <PageTitle title="Fullscreen workspace" />
      </PageLayout.Header>
      <PageLayout.Content width={fullscreen ? 'viewport' : 'default'}>
        <div
          data-shell-workspace
          style={{ height: fullscreen ? '100%' : undefined, overflow: fullscreen ? 'auto' : undefined }}
        >
          <Button onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          </Button>
          <LayoutSlotPlaceholder name="Child-owned scroll area" tone="primary" minHeight={1600} />
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

/**
 * The route states the band can be handed, keyed by the `PageLayout` props that produce them.
 * Used as an arg `mapping` so the Controls panel switches between them: the band stays mounted across the switch, which is what makes the height change animate.
 */
export const shellPageOptions = {
  'header + headerSize="default"': <ShellStoryPage headerSize="default" />,
  'header + headerSize="compact"': <ShellStoryPage headerSize="compact" />,
  'no header prop': <ShellStoryPage />,
  'viewport height': <ShellStoryPage headerSize="compact" height="viewport" />,
} satisfies Record<string, ReactNode>;

export type ShellPageOption = keyof typeof shellPageOptions;

export const shellPageOptionLabels = Object.keys(shellPageOptions) as ShellPageOption[];

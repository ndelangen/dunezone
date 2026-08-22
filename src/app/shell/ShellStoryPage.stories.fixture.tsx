import { LayoutSlotPlaceholder } from '@ui/layout/LayoutSlotPlaceholder.stories.fixture';
import { PageLayout } from '@ui/layout/PageLayout';
import { useEffect } from 'react';
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
function ShellStoryPage({ headerSize }: { headerSize?: 'default' | 'compact' }) {
  return (
    <PageLayout>
      {headerSize && (
        <PageLayout.Header size={headerSize}>
          <LayoutSlotPlaceholder name="header slot" minHeight={0} />
        </PageLayout.Header>
      )}
      <PageLayout.Content>
        <LayoutSlotPlaceholder name="children slot" minHeight={1400} />
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
} satisfies Record<string, ReactNode>;

export type ShellPageOption = keyof typeof shellPageOptions;

export const shellPageOptionLabels = Object.keys(shellPageOptions) as ShellPageOption[];

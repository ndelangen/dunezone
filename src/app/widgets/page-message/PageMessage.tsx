import { Anchor, Stack } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import type { PageHeaderSize } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import styles from './PageMessage.module.css';

const BackAnchor = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<'a'>>(function BackAnchor(props, ref) {
  return <Anchor ref={ref} {...props} />;
});

export interface PageMessageProps {
  /** The page's own name, the same one it wears when it has its content: "Faction", "Ruleset", "Edit group". */
  title: string;
  /**
   * The band this page would have had.
   * Match the loaded page so the header does not resize under the reader the moment the data lands.
   */
  size?: PageHeaderSize;
  /** The way out, as a `PageMessage.Back`. Omit it on a page that is already the top of its own branch. */
  back?: ReactNode;
  /** What the page has to say: `LoadPending`, `NotAvailable`, `LoadError`, `LoginGate`. */
  children: ReactNode;
}

/**
 * The page a route shows instead of its content: still loading, not there, not yours, not loaded, not signed in.
 *
 * All five are the same page with different words, so this owns everything that is not the words.
 * The frame, the band and its name, the pane, and the way back out, which is the piece a reader most needs from a page that cannot show them what they came for and the piece hand-written copies most often left off.
 * The words themselves are blocks the caller drops in, one per state, and that split is deliberate: an error body has a live region and a reload button that a pending body must not have, so the states cannot be one component with a mode.
 *
 * The message never says which state it is showing;
 * the caller has already decided that by choosing which block to hand it.
 *
 * Testing contract: `PageMessage.Back` is built with `createLink`, whose `useLinkProps` reads router context and throws outside a `RouterProvider`, so a unit test rendering one of these frames must supply a router or mock `createLink` alongside `Link`.
 * It surfaces as `Cannot read properties of null (reading 'isServer')` rather than as a failed assertion, which is why it is written down here rather than left to be rediscovered.
 *
 * It exists because about seventeen sites framed these messages themselves, and the frames drifted apart while nobody was comparing them: some centred the header and some did not, some offered a way back inside the pane and some in a toolbar and some not at all, and the pane came at two paddings depending on which page you had reached.
 */
export function PageMessage({ title, size = 'default', back, children }: PageMessageProps) {
  return (
    <PageLayout>
      <PageLayout.Header size={size}>
        <div className={styles.scrim}>
          <Stack align="center" gap="xs">
            <PageTitle title={title} />
            {back}
          </Stack>
        </div>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">{children}</Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** The way back out, taking the same route props as the router's own `Link`. Rendered as the themed anchor, in the band, wherever the message puts it. */
PageMessage.Back = createLink(BackAnchor);

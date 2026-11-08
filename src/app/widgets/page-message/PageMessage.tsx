import { Stack } from '@mantine/core';
import { Link, useLocation } from '@tanstack/react-router';
import type { LinkComponentProps, RegisteredRouter } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { TopicIcon } from '@ui/content/TopicIcon';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import type { PageHeaderSize } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { ErrorCard } from './ErrorCard';
import styles from './PageMessage.module.css';

type BackProps<
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = LinkComponentProps<'a', RegisteredRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
  /** Where it goes, in words: "Back to rulesets". */
  children: string;
};

/**
 * The way out as a boxed worded action, since a worded link standing alone in the band is the unframed button the app does not use (Norbert, 2026-11-07).
 * The router's own `Link` is the action's root, so it composes the press, the ref and the active state with the button's.
 */
function Back<
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>({ children, ...link }: BackProps<TFrom, TTo, TMaskFrom, TMaskTo>): ReactElement {
  return (
    <LabeledAction
      icon={<ArrowLeft size={16} />}
      renderRoot={(rootProps) => (
        <Link
          {...rootProps}
          {...(link as LinkComponentProps<'a'>)}
          className={clsx(rootProps.className, (link as { className?: string }).className)}
        />
      )}
    >
      {children}
    </LabeledAction>
  );
}

/** The way home, for a page with no nearer place to go back to: one glyph and one wording wherever it is offered. */
function Home(): ReactElement {
  return (
    <LabeledAction
      icon={<TopicIcon topic="home" size={16} />}
      renderRoot={(rootProps) => <Link {...rootProps} to="/" />}
    >
      Go home
    </LabeledAction>
  );
}

export interface PageMessageProps {
  /** The page's own name, the same one it wears when it has its content: "Faction", "Ruleset", "Edit group". */
  title: string;
  /**
   * The band this page would have had.
   * Match the loaded page so the header does not resize under the reader the moment the data lands.
   */
  size?: PageHeaderSize;
  /** One sentence under the name, for a message short enough to be said in the band alone: the 404 says everything there. */
  lede?: string;
  /** The way out, as a `PageMessage.Back` or `PageMessage.Home`. Omit it on a page that is already the top of its own branch. */
  back?: ReactNode;
  /** What the page has to say: `PageState`, `LoadError`, `LoginGate`. Omit it when the lede says it all, and the page has no pane. */
  children?: ReactNode;
  /**
   * Deals the message onto the page as a treachery card instead of saying it in the band: the band collapses, and the card carries `card.name`, the code as its type, and the lede as its text.
   * For an error a reader hits rather than waits on, such as a missing page or a failed sign-in (Norbert, 2026-11-08).
   * Needs a `lede`.
   */
  card?: { name: string; code: string };
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
 * Testing contract: `PageMessage.Back` renders the router's `Link`, which reads router context and throws outside a `RouterProvider`, so a unit test rendering one of these frames must supply a router or mock `Link`.
 * It surfaces as `Cannot read properties of null (reading 'isServer')` rather than as a failed assertion, which is why it is written down here rather than left to be rediscovered.
 *
 * It exists because about seventeen sites framed these messages themselves, and the frames drifted apart while nobody was comparing them: some centred the header and some did not, some offered a way back inside the pane and some in a toolbar and some not at all, and the pane came at two paddings depending on which page you had reached.
 */
export function PageMessage({ title, size = 'default', lede, back, children, card }: PageMessageProps) {
  if (card && lede !== undefined) {
    return <CardMessage title={title} lede={lede} back={back} card={card} />;
  }
  return (
    <PageLayout>
      <PageLayout.Header size={size}>
        <Stack align="center" gap="md">
          <PageTitle title={title} lede={lede} />
          {back}
        </Stack>
      </PageLayout.Header>
      {children == null ? null : (
        <PageLayout.Content>
          <Surface padding="xl">{children}</Surface>
        </PageLayout.Content>
      )}
    </PageLayout>
  );
}

/* The band keeps the name and the sentence for screen readers and search engines; the card, which says the same, is what the eye gets. */
function CardMessage({
  title,
  lede,
  back,
  card,
}: Readonly<{ title: string; lede: string; back?: ReactNode; card: { name: string; code: string } }>) {
  const { pathname } = useLocation();
  return (
    <PageLayout>
      <PageLayout.Header size="collapsed">
        <PageTitle title={title} lede={lede} />
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack align="center" gap="xl" className={styles.dealt}>
          <ErrorCard name={card.name} code={card.code} text={lede} seed={pathname} />
          {back}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** The way back out, taking the same route props as the router's own `Link`, rendered as a boxed `LabeledAction` in the band. */
PageMessage.Back = Back;
/** The way home, as a boxed `LabeledAction`. */
PageMessage.Home = Home;

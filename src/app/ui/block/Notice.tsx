import { Alert, Stack } from '@mantine/core';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { Disclosure } from './Disclosure';
import styles from './Notice.module.css';

/**
 * What a notice means to the reader;
 * the colour and glyph follow from it, never the other way round.
 * A failure is not a tone here: an attempt that did not happen is a `FormError`.
 */
type NoticeTone = 'neutral' | 'caution' | 'positive' | 'info';

const TONE: Record<NoticeTone, { color: string; icon: ReactNode }> = {
  /* An optional part left empty, or a choice about to replace what is there. */
  neutral: { color: 'gray', icon: <Info size={18} /> },
  /* Something the reader should look at before going on: a missing link, words changed under them. */
  caution: { color: 'yellow', icon: <TriangleAlert size={18} /> },
  /* An action that just finished. */
  positive: { color: 'confirm', icon: <CircleCheck size={18} /> },
  /* A fact about the state of things that asks nothing of the reader. */
  info: { color: 'blue', icon: <Info size={18} /> },
};

interface NoticeCommonProps {
  /** The reader-facing meaning. Omitted is `neutral`. */
  tone?: NoticeTone;
  /** The sentence that says why it matters or what to do. */
  children: ReactNode;
  /** Announce the notice the moment it appears, for one that follows the reader's own action: "Another editor saved first". */
  live?: boolean;
}

interface OpenNoticeProps extends NoticeCommonProps {
  /** What the notice is about, as a short heading: "No decals". */
  title?: string;
  /** The way on, under the words, as a `LabeledAction`. */
  action?: ReactNode;
  /** Lets the reader close a notice that only reports something that already happened, like a redirect's reason. */
  onDismiss?: () => void;
  collapsible?: false;
}

/*
 * The whole box of a collapsible notice is its toggle, so nothing else in it can be pressed.
 * That is why it takes neither an action nor a dismissal.
 */
interface CollapsibleNoticeProps extends NoticeCommonProps {
  /** The one line the notice shows while shut, and the name of its toggle. */
  title: string;
  /** Shows the title alone on one line, and opens to the children when the notice is pressed. */
  collapsible: true;
  action?: never;
  onDismiss?: never;
}

export type NoticeProps = OpenNoticeProps | CollapsibleNoticeProps;

/**
 * Tells the reader something about the page that is not a failure.
 *
 * Callers own the words and decide when there is anything to say.
 * This owns the treatment: the light alert in the tone's colour, its glyph, and the live region when one is asked for.
 * `FormError` is its sibling for an attempt that failed;
 * a red notice is that, not this.
 *
 * A `collapsible` notice is an extra on a page that is about something else.
 * It starts as its title on one line, and a press anywhere in the box opens and shuts the words under it.
 *
 * It exists because yellow, orange, caution, gray, blue and confirm Alerts were picked call site by call site, some filled and some light, some with an icon and most without, so the same "nothing here yet" read three different ways.
 */
export function Notice({
  tone = 'neutral',
  title,
  children,
  action,
  live = false,
  onDismiss,
  collapsible = false,
}: NoticeProps) {
  const { color, icon } = TONE[tone];
  /* Mantine's Alert is an assertive live region by default; a notice is a note unless it follows the reader's own action. */
  const alert = { color, variant: 'light', icon: <span aria-hidden>{icon}</span>, role: live ? 'status' : 'note' };
  if (collapsible) {
    return (
      <Alert {...alert} className={styles.collapsible}>
        <Disclosure title={title ?? ''}>{children}</Disclosure>
      </Alert>
    );
  }
  return (
    <Alert
      {...alert}
      title={title}
      {...(onDismiss ? { withCloseButton: true, closeButtonLabel: 'Dismiss', onClose: onDismiss } : {})}
    >
      {action ? (
        <Stack gap="sm" align="flex-start">
          {children}
          {action}
        </Stack>
      ) : (
        children
      )}
    </Alert>
  );
}

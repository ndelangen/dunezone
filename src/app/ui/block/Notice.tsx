import { Alert, Stack } from '@mantine/core';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * What a notice means to the reader;
 * the colour and glyph follow from it, never the other way round.
 * A failure is not a tone here: an attempt that did not happen is a `FormError`.
 */
export type NoticeTone = 'neutral' | 'caution' | 'positive' | 'info';

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

export interface NoticeProps {
  /** The reader-facing meaning. Omitted is `neutral`. */
  tone?: NoticeTone;
  /** What the notice is about, as a short heading: "No decals". */
  title?: string;
  /** The sentence that says why it matters or what to do. */
  children: ReactNode;
  /** The way on, under the words, as a `LabeledAction`. */
  action?: ReactNode;
  /** Announce the notice the moment it appears, for one that follows the reader's own action: "Another editor saved first". */
  live?: boolean;
  /** Lets the reader close a notice that only reports something that already happened, like a redirect's reason. */
  onDismiss?: () => void;
}

/**
 * Tells the reader something about the page that is not a failure.
 *
 * Callers own the words and decide when there is anything to say.
 * This owns the treatment: the light alert in the tone's colour, its glyph, and the live region when one is asked for.
 * `FormError` is its sibling for an attempt that failed;
 * a red notice is that, not this.
 *
 * It exists because yellow, orange, caution, gray, blue and confirm Alerts were picked call site by call site, some filled and some light, some with an icon and most without, so the same "nothing here yet" read three different ways.
 */
export function Notice({ tone = 'neutral', title, children, action, live = false, onDismiss }: NoticeProps) {
  const { color, icon } = TONE[tone];
  return (
    <Alert
      color={color}
      variant="light"
      title={title}
      icon={<span aria-hidden>{icon}</span>}
      /* Mantine's Alert is an assertive live region by default; a notice is a note unless it follows the reader's own action. */
      role={live ? 'status' : 'note'}
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

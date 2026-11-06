import { HoverCard } from '@mantine/core';
import { cloneElement } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';

import { splitMentions } from './mentions';
import type { Mention } from './mentions';
import styles from './MentionText.module.css';
import { SeatCard } from './SeatCard';

export type MentionActions = Readonly<{
  /** Brings up a seat's faction information. */
  onInfo?: (seat: string) => void;
  /** Opens the chat with a seat's player. */
  onChat?: (seat: string) => void;
}>;

/** A message's text, with each seat it names after an @ underlined and carrying its card. */
export function MentionText({
  text,
  mentions,
  ...actions
}: Readonly<{ text: string; mentions: readonly Mention[] }> & MentionActions) {
  if (!mentions.length) {
    return text;
  }
  return splitMentions(text, mentions).map((segment, index) =>
    segment.seats ? (
      <MentionCard key={index} seats={segment.seats} {...actions}>
        <span className={styles.mention} data-mention={segment.seats[0]!.id} role="button" tabIndex={0}>
          {segment.text}
        </span>
      </MentionCard>
    ) : (
      segment.text
    )
  );
}

type MentionCardProps = Readonly<{
  /** The seats the name means: one, or each seat sharing a faction name. */
  seats: readonly Mention[];
  /** What hovering shows the card: a single element. */
  children: ReactElement<{ onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void }>;
  /** Shows the card from the start rather than on hover. */
  initiallyOpened?: boolean;
}> &
  MentionActions;

/**
 * A seat's card, shown hovering what names it (an @ in a message, a writer's token): its player and faction, with the way to its faction information and its chat.
 * A name seats share shows each of them.
 * From the keyboard, focus opens the card, Enter or Space steps into its buttons, and Escape, or a Tab past either end, steps back out to the name.
 */
export function MentionCard({ seats, children, onInfo, onChat, initiallyOpened = false }: MentionCardProps) {
  return (
    <HoverCard
      openDelay={150}
      closeDelay={150}
      position="top-start"
      withinPortal
      shadow="md"
      initiallyOpened={initiallyOpened}
    >
      <HoverCard.Target>{cloneElement(children, { onKeyDown: enterCard })}</HoverCard.Target>
      <HoverCard.Dropdown p={0} onKeyDown={leaveCard}>
        {seats.map((seat) => (
          <SeatCard
            key={seat.id}
            mention={seat}
            onInfo={onInfo && (() => onInfo(seat.id))}
            onChat={seat.chattable && onChat ? () => onChat(seat.id) : undefined}
          />
        ))}
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

/* Enter or Space on what names a seat steps into its open card (the one the name's aria-controls points at), onto the first button. */
const ACTIVATE = new Set(['Enter', ' ']);

function enterCard(event: KeyboardEvent<HTMLElement>) {
  const card = document.getElementById(event.currentTarget.getAttribute('aria-controls') ?? '');
  const first = card?.querySelector<HTMLElement>('button');
  if (ACTIVATE.has(event.key) && first) {
    event.preventDefault();
    first.focus();
  }
}

/* Escape, or a Tab past the card's first or last button, hands the focus back to the name that opened it. */
function leaveCard(event: KeyboardEvent<HTMLDivElement>) {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('button')];
  const edge = event.shiftKey ? buttons[0] : buttons.at(-1);
  const leaving = event.key === 'Escape' || (event.key === 'Tab' && document.activeElement === edge);
  const trigger = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(event.currentTarget.id)}"]`);
  if (leaving && trigger) {
    event.preventDefault();
    event.stopPropagation();
    trigger.focus();
  }
}

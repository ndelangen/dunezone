import { HoverCard } from '@mantine/core';
import type { ReactElement } from 'react';

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
    segment.mention ? (
      <MentionCard key={index} mention={segment.mention} {...actions}>
        <span className={styles.mention} data-mention={segment.mention.id} role="button" tabIndex={0}>
          {segment.text}
        </span>
      </MentionCard>
    ) : (
      segment.text
    )
  );
}

/** A seat's card, shown hovering what names it (an @ in a message, a writer's token): its player and faction, with the way to its faction information and its chat. */
export function MentionCard({
  mention,
  children,
  onInfo,
  onChat,
  initiallyOpened = false,
}: Readonly<{
  mention: Mention;
  /** What hovering shows the card: a single element. */
  children: ReactElement;
  /** Shows the card from the start rather than on hover. */
  initiallyOpened?: boolean;
}> &
  MentionActions) {
  const chat = mention.chattable && onChat;
  return (
    <HoverCard
      openDelay={150}
      closeDelay={150}
      position="top-start"
      withinPortal
      shadow="md"
      initiallyOpened={initiallyOpened}
    >
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown p={0}>
        <SeatCard
          mention={mention}
          onInfo={onInfo && (() => onInfo(mention.id))}
          onChat={chat ? () => chat(mention.id) : undefined}
        />
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

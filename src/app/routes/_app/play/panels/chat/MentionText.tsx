import { Avatar, Group, HoverCard, Stack, Text } from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import { LabeledAction } from '@ui/control/LabeledAction';
import { MessagesSquare } from 'lucide-react';
import type { ReactElement } from 'react';

import { FactionTokenFace } from '../../multiplayer/FactionTokenFace';
import { splitMentions } from './mentions';
import type { Mention } from './mentions';
import styles from './MentionText.module.css';

/* The avatar and the token in a mention's card share one size, so the player's line and the faction's line align. */
const CARD_FACE = 24;

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
        <span className={styles.mention} data-mention={segment.mention.id}>
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
      <HoverCard.Dropdown>
        <Stack gap="xs">
          {mention.detail && (
            <Group gap="xs" wrap="nowrap">
              <Avatar src={mention.avatar} size={CARD_FACE} radius="50%" alt="">
                {mention.detail.slice(0, 1)}
              </Avatar>
              <Text size="sm" fw={700}>
                {mention.detail}
              </Text>
            </Group>
          )}
          <Group gap="xs" wrap="nowrap">
            <FactionTokenFace token={mention.token} size={CARD_FACE} style={{ flexShrink: 0 }} aria-hidden />
            <Text size="sm">{mention.label}</Text>
          </Group>
          {(onInfo || chat) && (
            <Group gap="xs" wrap="nowrap">
              {onInfo && (
                <LabeledAction
                  size="compact-sm"
                  icon={<TopicIcon topic="factions" size={14} />}
                  onClick={() => onInfo(mention.id)}
                >
                  Info
                </LabeledAction>
              )}
              {chat && (
                <LabeledAction size="compact-sm" icon={<MessagesSquare size={14} />} onClick={() => chat(mention.id)}>
                  Chat
                </LabeledAction>
              )}
            </Group>
          )}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

import { Avatar, Group, HoverCard, Stack, Text } from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import { LabeledAction } from '@ui/control/LabeledAction';
import { MessagesSquare } from 'lucide-react';

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
      <MentionCard key={index} mention={segment.mention} written={segment.text} {...actions} />
    ) : (
      segment.text
    )
  );
}

/** A named seat, underlined: hovering it shows the seat's player and faction, with the way to its faction information and its chat. */
export function MentionCard({
  mention,
  written,
  onInfo,
  onChat,
  initiallyOpened = false,
}: Readonly<{
  mention: Mention;
  /** The mention as the message wrote it, @ included. */
  written: string;
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
      <HoverCard.Target>
        <span className={styles.mention} data-mention={mention.id}>
          {written}
        </span>
      </HoverCard.Target>
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

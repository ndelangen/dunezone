import { Avatar, Group, Text, Tooltip } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { Info, MessagesSquare } from 'lucide-react';

import { FactionTokenFace } from '../../multiplayer/FactionTokenFace';
import type { Mention } from './mentions';
import styles from './SeatCard.module.css';

const FACE = 20;
const ICON = 17;

export type SeatCardProps = Readonly<{
  mention: Mention;
  /** Brings up the seat's faction information; absent where there is nothing to bring it up in. */
  onInfo?: () => void;
  /** Opens the chat with the seat's player; absent for the viewer's own seat, or where the viewer has no chat with them. */
  onChat?: () => void;
}>;

/**
 * A seat in one small line: the player's avatar with the faction's token tucked a little over it, "Paul is playing Fremen", then Info and Chat as quiet icons behind a rule.
 */
export function SeatCard({ mention, onInfo, onChat }: SeatCardProps) {
  return (
    <Group gap="sm" wrap="nowrap" className={styles.card}>
      <Group gap={6} wrap="nowrap" className={styles.who}>
        <span className={styles.faces}>
          {mention.detail && (
            <Avatar src={mention.avatar} size={FACE} radius="50%" alt="">
              {mention.detail.slice(0, 1)}
            </Avatar>
          )}
          <FactionTokenFace token={mention.token} size={FACE} aria-hidden />
        </span>
        {/* The line in full, for names the card's width cuts short. */}
        <Tooltip label={seatLine(mention)} openDelay={500} withinPortal>
          <Text size="sm" truncate="end">
            {mention.own ? (
              'You are playing '
            ) : mention.detail ? (
              <>
                <Text span size="sm" fw={600}>
                  {mention.detail}
                </Text>
                {' is playing '}
              </>
            ) : null}
            <Text span size="sm" fw={600}>
              {mention.label}
            </Text>
          </Text>
        </Tooltip>
      </Group>
      {(onInfo || onChat) && (
        <Group gap={2} wrap="nowrap" className={styles.actions}>
          {onInfo && (
            <IconAction
              size="md"
              emphasis="quiet"
              label="Info"
              tooltip="Faction info"
              icon={<Info size={ICON} />}
              onClick={onInfo}
            />
          )}
          {onChat && (
            <IconAction
              size="md"
              emphasis="quiet"
              label="Chat"
              tooltip="Chat with this player"
              icon={<MessagesSquare size={ICON} />}
              onClick={onChat}
            />
          )}
        </Group>
      )}
    </Group>
  );
}

/* The card's line as plain words. */
function seatLine(mention: Mention) {
  const who = mention.own ? 'You are' : mention.detail ? `${mention.detail} is` : null;
  return who ? `${who} playing ${mention.label}` : mention.label;
}

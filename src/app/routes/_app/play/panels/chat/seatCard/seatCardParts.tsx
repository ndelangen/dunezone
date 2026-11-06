import { Avatar, Group, Text } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Info, MessagesSquare } from 'lucide-react';

import { FactionTokenFace } from '../../../multiplayer/FactionTokenFace';
import type { Mention } from '../mentions';
import styles from './SeatCard.module.css';

const ICON = 17;

/** The seat's player's avatar, or their initial without one. */
export function PlayerAvatar({ mention, size }: Readonly<{ mention: Mention; size: number }>) {
  return (
    <Avatar src={mention.avatar} size={size} radius="50%" alt="" style={{ flexShrink: 0 }}>
      {mention.detail?.slice(0, 1)}
    </Avatar>
  );
}

/** Info and Chat as the toolbar's icon actions. */
export function SeatIconActions({
  onInfo,
  onChat,
  size = 'lg',
  emphasis = 'standard',
}: Readonly<{
  onInfo?: () => void;
  onChat?: () => void;
  size?: 'md' | 'lg';
  emphasis?: 'quiet' | 'standard';
}>) {
  return (
    <>
      {onInfo && (
        <IconAction
          size={size}
          emphasis={emphasis}
          label="Info"
          tooltip="Faction info"
          icon={<Info size={ICON} />}
          onClick={onInfo}
        />
      )}
      {onChat && (
        <IconAction
          size={size}
          emphasis={emphasis}
          label="Chat"
          tooltip="Chat with this player"
          icon={<MessagesSquare size={ICON} />}
          onClick={onChat}
        />
      )}
    </>
  );
}

/** Info and Chat as labelled actions. */
export function SeatLabeledActions({ onInfo, onChat }: Readonly<{ onInfo?: () => void; onChat?: () => void }>) {
  return (
    <>
      {onInfo && (
        <LabeledAction size="compact-sm" icon={<Info size={14} />} onClick={onInfo}>
          Info
        </LabeledAction>
      )}
      {onChat && (
        <LabeledAction size="compact-sm" icon={<MessagesSquare size={14} />} onClick={onChat}>
          Chat
        </LabeledAction>
      )}
    </>
  );
}

const FACE = 20;

/**
 * The seat in one small line: the player's avatar with the faction's token tucked a little over it, then "Ridwan is playing Fremen".
 * `strong` sets both names in bold, with the words between them dimmed.
 */
export function SeatLine({ mention, strong = false }: Readonly<{ mention: Mention; strong?: boolean }>) {
  const name = (text: string) => (
    <Text span size="sm" fw={strong ? 700 : 600}>
      {text}
    </Text>
  );
  const words = (text: string) => (
    <Text span size="sm" c={strong ? 'dimmed' : undefined}>
      {text}
    </Text>
  );
  return (
    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
      <span className={styles.faces}>
        {mention.detail && <PlayerAvatar mention={mention} size={FACE} />}
        <FactionTokenFace token={mention.token} size={FACE} aria-hidden />
      </span>
      <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
        {mention.own ? (
          words('You are playing ')
        ) : mention.detail ? (
          <>
            {name(mention.detail)}
            {words(' is playing ')}
          </>
        ) : null}
        {name(mention.label)}
      </Text>
    </Group>
  );
}

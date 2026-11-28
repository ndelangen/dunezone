import { Popover, Stack, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Check, Link2 } from 'lucide-react';

/* The button is the whole share; the address itself shows only when copying fails, for the player to copy by hand. */
export function GameLink({ address, page }: Readonly<{ address: string; page?: string }>) {
  const clipboard = useClipboard();
  const url = new URL(page ?? `/play/${address}`, window.location.origin).href;
  return (
    <Stack gap="xs" p="xs" maw={300}>
      <LabeledAction
        icon={clipboard.copied ? <Check size={16} /> : <Link2 size={16} />}
        onClick={() => clipboard.copy(url)}
      >
        {clipboard.copied ? 'Game link copied' : 'Copy game link'}
      </LabeledAction>
      {clipboard.error ? (
        <Text size="xs" role="alert" style={{ overflowWrap: 'anywhere' }}>
          Could not copy. Select and copy this link: {url}
        </Text>
      ) : null}
    </Stack>
  );
}

/** The drafting chip's invitation while seats are still open: one compact button that copies the game link. */
export function InviteLink({ address, page }: Readonly<{ address: string; page?: string | undefined }>) {
  const clipboard = useClipboard();
  const url = new URL(page ?? `/play/${address}`, window.location.origin).href;
  /* When copying fails the link opens beneath the button as text, for the player to copy by hand. */
  return (
    <Popover opened={Boolean(clipboard.error)} onChange={(open) => !open && clipboard.reset()} withinPortal>
      <Popover.Target>
        <LabeledAction
          size="compact-sm"
          icon={clipboard.copied ? <Check size={14} /> : <Link2 size={14} />}
          onClick={() => clipboard.copy(url)}
        >
          {clipboard.copied ? 'Link copied' : clipboard.error ? 'Copy failed' : 'Copy invite link'}
        </LabeledAction>
      </Popover.Target>
      <Popover.Dropdown maw={300}>
        <Text size="xs" role="alert" style={{ overflowWrap: 'anywhere', userSelect: 'all' }}>
          Could not copy. Select and copy this link: {url}
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}

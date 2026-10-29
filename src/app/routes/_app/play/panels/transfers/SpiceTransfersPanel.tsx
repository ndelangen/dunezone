import { Button, Group, List, Stack, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';

export type SpiceTransfersPanelProps = Readonly<{
  /** The transfers on show, newest first, each as its line reads. */
  transfers: readonly Readonly<{ key: number; text: string }>[];
  /** The heading is only for assistive technology inside a game's window. */
  hiddenHeading: boolean;
  /** Older transfers follow this page. */
  more: boolean;
  /** This is the newest page. */
  latest: boolean;
  onEarlier: () => void;
  onLatest: () => void;
}>;

/** The table's public spice transfers, newest first, with older pages a click away. */
export function SpiceTransfersPanel({
  transfers,
  hiddenHeading,
  more,
  latest,
  onEarlier,
  onLatest,
}: SpiceTransfersPanelProps) {
  return (
    <Section hiddenHeading={hiddenHeading} title="Public spice transfers">
      <Stack gap="xs">
        {transfers.length === 0 ? (
          <Text size="sm">No spice transfers yet.</Text>
        ) : (
          <Text size="xs" c="dimmed">
            Newest first
          </Text>
        )}
        <List type="ordered" size="sm">
          {transfers.map((transfer) => (
            <List.Item key={transfer.key}>{transfer.text}</List.Item>
          ))}
        </List>
        <Group>
          {more && (
            <Button variant="default" onClick={onEarlier}>
              Earlier spice transfers
            </Button>
          )}
          {!latest && (
            <Button variant="default" onClick={onLatest}>
              Latest spice transfers
            </Button>
          )}
        </Group>
      </Stack>
    </Section>
  );
}

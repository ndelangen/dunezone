import { Avatar, Button, Checkbox, Indicator, Stack, Text } from '@mantine/core';
import { groupMembers, TABLE_CONVERSATION } from '@shared/play/conversations';
import { Section } from '@ui/block/Section';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { Plus, Users } from 'lucide-react';
import { useState } from 'react';

import type { ConversationView } from '../../../../db/tabletop/ConversationSession';

/* The rail entry that starts a group; it is a selection like any channel but holds no conversation. */
export const NEW_GROUP = '@new-group';

type Faction = { id: string; name: string };
type Context = NonNullable<ConversationView['context']>;

/** A group is named by its other members, so each member reads it as the people they are talking to. */
export function channelName(context: Context, peerId: string) {
  if (peerId === TABLE_CONVERSATION) {
    return 'Whole table';
  }
  const others = (groupMembers(peerId) ?? []).filter((member) => member !== context.factionId);
  return others.map((member) => context.peers.find((peer) => peer.id === member)?.name ?? member).join(', ');
}

/** The table, every group this faction has a conversation in or has just started, then the way to start another. */
export function channelIds(view: ConversationView, started: readonly string[]) {
  const groups = view.summaries.map((summary) => summary.peerId).filter((peerId) => groupMembers(peerId));
  return [TABLE_CONVERSATION, ...new Set([...groups, ...started])];
}

/**
 * The rail items for the group conversations, as direct children of the players level.
 * They are returned as elements rather than a component because the rail only sees items it is handed directly.
 */
export function channelItems({
  view,
  started,
  tokens,
  onSelect,
}: Readonly<{
  view: ConversationView;
  started: readonly string[];
  tokens: Readonly<Record<string, string | null>>;
  onSelect(peerId: string): void;
}>) {
  const context = view.context;
  if (!context) {
    return [];
  }
  const unread = (peerId: string) => view.summaries.find((entry) => entry.peerId === peerId)?.unread ?? 0;
  return [
    <NestedTabs.Group key="channels" label="Group conversations" icon={<Users size={16} aria-hidden />}>
      {channelIds(view, started).map((peerId) => (
        <NestedTabs.Item
          key={peerId}
          as="button"
          type="button"
          path={[peerId]}
          label={`${channelName(context, peerId)}${unread(peerId) ? `, ${unread(peerId)} unread` : ''}`}
          icon={
            <Indicator size={16} label={unread(peerId) || undefined} disabled={!unread(peerId)}>
              <ChannelIcon context={context} peerId={peerId} tokens={tokens} />
            </Indicator>
          }
          onClick={() => onSelect(peerId)}
        />
      ))}
      <NestedTabs.Item
        as="button"
        type="button"
        path={[NEW_GROUP]}
        label="New group"
        icon={<Plus size={22} aria-hidden />}
        onClick={() => onSelect(NEW_GROUP)}
      />
    </NestedTabs.Group>,
  ];
}

function ChannelIcon({
  context,
  peerId,
  tokens,
}: Readonly<{ context: Context; peerId: string; tokens: Readonly<Record<string, string | null>> }>) {
  if (peerId === TABLE_CONVERSATION) {
    return (
      <Avatar size={26} radius="xl" alt="">
        <Users size={16} aria-hidden />
      </Avatar>
    );
  }
  const others = (groupMembers(peerId) ?? []).filter((member) => member !== context.factionId);
  return (
    <Avatar.Group spacing={14}>
      {others.slice(0, 2).map((member) => (
        <Avatar key={member} src={tokens[member] ?? null} size={22} radius="xl" alt="" />
      ))}
    </Avatar.Group>
  );
}

/** Picks two or more other factions to talk with together; the caller opens the group once it is started. */
export function NewGroup({ peers, onStart }: Readonly<{ peers: Faction[]; onStart(members: string[]): void }>) {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <Section title="New group" description="Pick two or more factions. Only the factions in a group can read it.">
      <Stack gap="sm">
        <Checkbox.Group value={picked} onChange={setPicked}>
          <Stack gap="xs">
            {peers.map((peer) => (
              <Checkbox key={peer.id} value={peer.id} label={peer.name} />
            ))}
          </Stack>
        </Checkbox.Group>
        {picked.length === 1 && (
          <Text size="sm" c="dimmed">
            Pick one more faction. To talk with one faction, open its player.
          </Text>
        )}
        <Button disabled={picked.length < 2} onClick={() => onStart(picked)} style={{ alignSelf: 'flex-start' }}>
          Start group
        </Button>
      </Stack>
    </Section>
  );
}

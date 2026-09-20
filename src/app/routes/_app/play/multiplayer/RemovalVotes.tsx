import { Avatar, Button, Group, Indicator, Stack, Text } from '@mantine/core';
import type { PublicControls } from '@shared/play/inventory';
import type { RemovalVote } from '@shared/play/removal';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { Surface } from '@ui/surface/Surface';
import { MessageCircle } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { Conversation } from './Conversation';
import type { TableProjection, TableSession } from './TableSession';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

export function RemovalDecisionBar({
  votes,
  onOpen,
}: Readonly<{ votes: RemovalVote[]; onOpen(vote: RemovalVote): void }>) {
  if (!votes.length) {
    return null;
  }
  return (
    <Surface padding="sm">
      <Group gap="sm" wrap="wrap">
        <TopicIcon topic="audit" />
        <Text size="sm" fw={700}>
          Removal voting
        </Text>
        {votes.map((vote) => (
          <Button
            key={vote.id}
            size="compact-sm"
            variant="subtle"
            aria-controls="player-public-state"
            onClick={() => {
              onOpen(vote);
              document.getElementById('player-public-state')?.scrollIntoView({ block: 'nearest' });
            }}
          >
            View vote about {vote.target.name}
          </Button>
        ))}
      </Group>
    </Surface>
  );
}

function Ballots({ ballots }: Readonly<{ ballots: RemovalVote['ballots'] }>) {
  return (
    <Stack gap={4}>
      {ballots.map((ballot, index) => (
        <Group key={`${ballot.seat}-${index}`} justify="space-between" gap="sm">
          <Text size="sm">{ballot.name}</Text>
          <StatusBadge
            tone={ballot.choice === 'remove' ? 'negative' : ballot.choice === 'keep' ? 'positive' : 'neutral'}
          >
            {ballot.choice === 'remove' ? 'Remove' : ballot.choice === 'keep' ? 'Keep' : 'Uncast'}
          </StatusBadge>
        </Group>
      ))}
    </Stack>
  );
}

function OpenVote({ client, table, vote }: Props & Readonly<{ vote: RemovalVote }>) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const approvals = vote.ballots.filter((ballot) => ballot.choice === 'remove').length;
  const against = vote.ballots.filter((ballot) => ballot.choice === 'keep').length;
  const own = vote.ballots.find((ballot) => ballot.seat === table.viewer.viewerSeat);
  const canVote = table.canInteract && own !== undefined;
  const elapsed = Math.max(0, Math.floor((now - vote.openedAt) / 1000));
  return (
    <Section helpOnly title={`Remove ${vote.target.name}?`}>
      <Stack gap="sm">
        <Text size="sm">
          {Math.max(0, vote.threshold - approvals)} more Remove or{' '}
          {Math.max(0, vote.ballots.length - vote.threshold + 1 - against)} more Keep to decide. Open{' '}
          {Math.floor(elapsed / 60)}m {elapsed % 60}s.
        </Text>
        <Ballots ballots={vote.ballots} />
        {canVote ? (
          <Group gap="sm">
            <Button
              aria-pressed={own.choice === 'remove'}
              variant={own.choice === 'remove' ? 'filled' : 'light'}
              onClick={() => client.command({ kind: 'removal-ballot', voteId: vote.id, choice: 'remove' })}
            >
              Remove
            </Button>
            <Button
              aria-pressed={own.choice === 'keep'}
              variant={own.choice === 'keep' ? 'filled' : 'light'}
              onClick={() => client.command({ kind: 'removal-ballot', voteId: vote.id, choice: 'keep' })}
            >
              Keep
            </Button>
            <Button
              variant="subtle"
              disabled={own.choice === null}
              onClick={() => client.command({ kind: 'removal-ballot', voteId: vote.id, choice: null })}
            >
              Withdraw
            </Button>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            {table.viewer.viewerSeat === vote.target.seat
              ? 'You cannot vote on your own removal.'
              : 'Only eligible players can vote.'}
          </Text>
        )}
      </Stack>
    </Section>
  );
}

/** The caller owns selection; the panel owns faction conversations, public information and ballot controls. */
export function PlayerPanel({
  client,
  table,
  selected,
  selectedTab,
  onSelect,
  error,
}: Props &
  Readonly<{
    selected: string | null;
    selectedTab: 'public' | 'conversation';
    onSelect(seat: string, tab: 'public' | 'conversation'): void;
    error: string | null;
  }>) {
  const { conversations } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const occupants = table.snapshot.controls?.players ?? [];
  const players = (
    table.snapshot.roster?.seats.map(
      (seat) =>
        occupants.find((player) => player.seat === seat.id) ?? {
          seat: seat.id,
          name: seat.faction?.name ?? seat.id,
          avatar: null,
        }
    ) ?? occupants
  )
    .slice()
    .sort((a, b) => Number(a.seat === table.viewer.viewerSeat) - Number(b.seat === table.viewer.viewerSeat));
  const votes = table.snapshot.removalVotes ?? [];
  const player = players.find((entry) => entry.seat === selected) ?? players[0];
  if (!player) {
    return null;
  }
  const vote = votes.find((entry) => entry.target.seat === player.seat);
  const peerId = rosterSeat(table.snapshot.roster, player.seat)?.faction?.id;
  const canConverse = peerId && conversations.context?.peers.some((peer) => peer.id === peerId);
  const activeTab = canConverse ? selectedTab : 'public';
  const unread = (seat: string) =>
    conversations.summaries.find((entry) => entry.peerId === rosterSeat(table.snapshot.roster, seat)?.faction?.id)
      ?.unread ?? 0;
  return (
    <NestedTabs activePath={[player.seat, activeTab]} ariaLabel="Players" className="seated-controls-tabs">
      <NestedTabs.Level label="Players">
        {players.map((entry) => {
          const active = votes.some((candidate) => candidate.target.seat === entry.seat);
          const token = table.snapshot.swapping?.tokens[entry.seat];
          const unreadLabel = unread(entry.seat) ? `, ${unread(entry.seat)} unread` : '';
          return (
            <NestedTabs.Item
              key={entry.seat}
              as="button"
              type="button"
              path={[entry.seat]}
              label={`${entry.name}${active ? ', removal vote in progress' : ''}${unreadLabel}`}
              icon={
                <Indicator
                  color={active ? 'red.6' : undefined}
                  size={16}
                  label={unread(entry.seat) || undefined}
                  disabled={!active && !unread(entry.seat)}
                >
                  <Avatar src={token ?? entry.avatar} size={26} radius="xl" alt="">
                    {entry.name.slice(0, 1)}
                  </Avatar>
                </Indicator>
              }
              onClick={() => {
                onSelect(entry.seat, 'conversation');
              }}
            />
          );
        })}
      </NestedTabs.Level>
      <NestedTabs.Level label={player.name}>
        {canConverse && (
          <NestedTabs.Item
            as="button"
            type="button"
            path={[player.seat, 'conversation']}
            label="Conversation"
            icon={
              <Indicator disabled={!unread(player.seat)} label={unread(player.seat)} size={16}>
                <MessageCircle size={22} aria-hidden />
              </Indicator>
            }
            onClick={() => onSelect(player.seat, 'conversation')}
          />
        )}
        <NestedTabs.Item
          as="button"
          type="button"
          path={[player.seat, 'public']}
          label="Info"
          icon={
            <Indicator color="red.6" size={10} disabled={!vote}>
              <TopicIcon topic="about" size={22} />
            </Indicator>
          }
          onClick={() => {
            onSelect(player.seat, 'public');
          }}
        />
      </NestedTabs.Level>
      <NestedTabs.ContentPanel className="seated-controls-tab-content">
        {activeTab === 'conversation' && peerId ? (
          <Conversation key={`${conversations.context?.factionId}:${peerId}`} client={client} peerId={peerId} />
        ) : (
          <Stack id="player-public-state" gap="lg">
            {error && <FormError title="From the table">{error}</FormError>}
            {vote && <OpenVote client={client} table={table} vote={vote} />}
            <PlayerInformation client={client} table={table} player={player} hasVote={Boolean(vote)} />
          </Stack>
        )}
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

function PlayerInformation({
  client,
  table,
  player,
  hasVote,
}: Props & Readonly<{ player: PublicControls['players'][number]; hasVote: boolean }>) {
  const faction = rosterSeat(table.snapshot.roster, player.seat)?.faction;
  const count = table.snapshot.controls?.players.length ?? 0;
  const canStart =
    table.snapshot.controls?.players.some((entry) => entry.seat === player.seat) &&
    !hasVote &&
    table.viewer.viewerSeat !== player.seat &&
    table.viewer.viewerSeat !== SPECTATOR_SEAT;
  return (
    <Section helpOnly title={player.name}>
      <Stack gap="sm">
        <Text size="sm">
          {faction?.name ?? 'No faction assigned'} · {player.seat.replace('seat-', 'Seat ')}
        </Text>
        {canStart && (
          <>
            <Button
              variant="default"
              disabled={!table.canInteract || count < 3}
              onClick={() => client.command({ kind: 'removal-start', seat: player.seat })}
            >
              Start removal vote
            </Button>
            {count < 3 && (
              <Text size="sm" c="dimmed">
                Removal requires at least three players.
              </Text>
            )}
          </>
        )}
      </Stack>
    </Section>
  );
}

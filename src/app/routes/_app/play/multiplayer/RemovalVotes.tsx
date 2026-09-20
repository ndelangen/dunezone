import { Avatar, Badge, Button, Group, Indicator, Stack, Text } from '@mantine/core';
import type { RemovalVote } from '@shared/play/removal';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { Surface } from '@ui/surface/Surface';
import { useEffect, useState, useSyncExternalStore } from 'react';

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
    <Section title={`Remove ${vote.target.name}?`}>
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

/** The caller owns selection; the panel owns public player information and the current player's ballot controls. */
export function PlayerVotes({
  client,
  table,
  selected,
  onSelect,
  error,
}: Props & Readonly<{ selected: string | null; onSelect(seat: string): void; error: string | null }>) {
  const players = table.snapshot.controls?.players ?? [];
  const votes = table.snapshot.removalVotes ?? [];
  const player = players.find((entry) => entry.seat === selected) ?? players[0];
  if (!player) {
    return null;
  }
  const vote = votes.find((entry) => entry.target.seat === player.seat);
  const faction = rosterSeat(table.snapshot.roster, player.seat)?.faction;
  return (
    <NestedTabs activePath={[player.seat, 'public']} ariaLabel="Players" className="seated-controls-tabs">
      <NestedTabs.Level label="Players">
        {players.map((entry) => {
          const active = votes.some((candidate) => candidate.target.seat === entry.seat);
          const token = table.snapshot.swapping?.tokens[entry.seat];
          return (
            <NestedTabs.Item
              key={entry.seat}
              as="button"
              type="button"
              path={[entry.seat]}
              label={`${entry.name}${active ? ', removal vote in progress' : ''}`}
              icon={
                <Indicator color="red.6" size={10} disabled={!active}>
                  <Avatar src={token ?? entry.avatar} size={26} radius="xl" alt="">
                    {entry.name.slice(0, 1)}
                  </Avatar>
                </Indicator>
              }
              onClick={() => onSelect(entry.seat)}
            />
          );
        })}
      </NestedTabs.Level>
      <NestedTabs.Level label={player.name}>
        <NestedTabs.Item
          as="button"
          type="button"
          path={[player.seat, 'public']}
          label="Public state"
          icon={
            <Indicator color="red.6" size={10} disabled={!vote}>
              <TopicIcon topic="about" size={22} />
            </Indicator>
          }
          onClick={() => onSelect(player.seat)}
        />
      </NestedTabs.Level>
      <NestedTabs.ContentPanel className="seated-controls-tab-content">
        <Stack id="player-public-state" gap="lg">
          {error && <FormError title="From the table">{error}</FormError>}
          {vote && <OpenVote client={client} table={table} vote={vote} />}
          <Section title={player.name}>
            <Stack gap="sm">
              <Text size="sm">
                {faction?.name ?? 'No faction assigned'} · {player.seat.replace('seat-', 'Seat ')}
              </Text>
              {!vote && table.viewer.viewerSeat !== player.seat && table.viewer.viewerSeat !== SPECTATOR_SEAT && (
                <>
                  <Button
                    variant="subtle"
                    disabled={!table.canInteract || players.length < 3}
                    onClick={() => client.command({ kind: 'removal-start', seat: player.seat })}
                  >
                    Start removal vote
                  </Button>
                  {players.length < 3 && (
                    <Text size="sm" c="dimmed">
                      Removal requires at least three players.
                    </Text>
                  )}
                </>
              )}
            </Stack>
          </Section>
        </Stack>
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

export function RemovalAudit({ client, table }: Props) {
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const page = view.removalHistory;
  useEffect(() => {
    client.readRemovalHistory();
  }, [client, table.liveRevision]);
  return (
    <Section title="Removal votes">
      <Stack gap="md">
        {!page ? (
          <Text size="sm">Loading vote history...</Text>
        ) : page.entries.length === 0 ? (
          <Text size="sm" c="dimmed">
            No completed removal votes.
          </Text>
        ) : (
          page.entries.map((result) => (
            <Stack key={result.id} gap="sm">
              <Group gap="sm">
                <Badge variant="default">Vote</Badge>
                <Text size="sm">
                  {result.target.name}:{' '}
                  {result.result === 'removed'
                    ? 'removed'
                    : result.result === 'failed'
                      ? 'removal failed'
                      : 'vote nullified'}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {new Date(result.resolvedAt).toLocaleString()} · {result.context}
              </Text>
              <Ballots ballots={result.ballots} />
            </Stack>
          ))
        )}
        {page?.more && (
          <Button variant="default" onClick={() => client.readRemovalHistory(page.entries.at(-1)!.sequence)}>
            Earlier votes
          </Button>
        )}
        {page && page.before !== Number.MAX_SAFE_INTEGER && (
          <Button variant="default" onClick={() => client.readRemovalHistory()}>
            Latest votes
          </Button>
        )}
      </Stack>
    </Section>
  );
}

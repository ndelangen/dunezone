import { Button, Group, Stack, Text } from '@mantine/core';
import type { PublicFaction } from '@shared/play/capture';
import type { RemovalVote } from '@shared/play/removal';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import type { ReactNode } from 'react';

import { FactionDetails } from './FactionDetails';
import { FactionInfoHeader } from './FactionInfoHeader';
import type { FactionInfoHeaderModel } from './FactionInfoHeader';

export type BallotChoice = 'remove' | 'keep';

/** A vote to remove the seat's player, as the viewer sees it. */
export type RemovalVoteView = Readonly<{
  /** The player the vote would remove. */
  target: string;
  ballots: RemovalVote['ballots'];
  /** How many more of each ballot decide the vote. */
  needed: Readonly<{ remove: number; keep: number }>;
  /** How long the vote has been open, in seconds. */
  elapsed: number;
  /** The viewer's own ballot, or why the viewer cannot vote. */
  ballot: Readonly<{ choice: BallotChoice | null }> | Readonly<{ reason: string }>;
}>;

export type FactionInfoPanelProps = Readonly<{
  /** The table's refusal of the last command sent from here. */
  error: string | null;
  vote: RemovalVoteView | null;
  /** Requests for the seat, while it is open. */
  requests: ReactNode;
  header: FactionInfoHeaderModel;
  /** The seat's trade, while seats are traded. */
  swapping: ReactNode;
  /** What the faction starts the game with, once its sheet is read. */
  details: PublicFaction | undefined;
  /** Casts the viewer's ballot, or withdraws it with null. */
  onBallot: (choice: BallotChoice | null) => void;
}>;

/* How each ballot reads: a Remove against, a Keep for, or not cast yet. */
const BALLOT_BADGES = {
  remove: { tone: 'negative', label: 'Remove' },
  keep: { tone: 'positive', label: 'Keep' },
  uncast: { tone: 'neutral', label: 'Uncast' },
} as const;

function Ballots({ ballots }: Readonly<{ ballots: RemovalVote['ballots'] }>) {
  return (
    <Stack gap={4}>
      {ballots.map((ballot, index) => (
        <Group key={`${ballot.seat}-${index}`} justify="space-between" gap="sm">
          <Text size="sm">{ballot.name}</Text>
          <StatusBadge tone={BALLOT_BADGES[ballot.choice ?? 'uncast'].tone}>
            {BALLOT_BADGES[ballot.choice ?? 'uncast'].label}
          </StatusBadge>
        </Group>
      ))}
    </Stack>
  );
}

function OpenVote({
  vote,
  onBallot,
}: Readonly<{ vote: RemovalVoteView; onBallot: FactionInfoPanelProps['onBallot'] }>) {
  const { ballot, elapsed } = vote;
  return (
    <Section hiddenHeading title={`Remove ${vote.target}?`}>
      <Stack gap="sm">
        <Text size="sm">
          {vote.needed.remove} more Remove or {vote.needed.keep} more Keep to decide.{' '}
          {elapsed < 1 ? 'Just opened.' : `Open ${Math.floor(elapsed / 60)}m ${elapsed % 60}s.`}
        </Text>
        <Ballots ballots={vote.ballots} />
        {'choice' in ballot ? (
          <Group gap="sm">
            <Button
              aria-pressed={ballot.choice === 'remove'}
              variant={ballot.choice === 'remove' ? 'filled' : 'light'}
              onClick={() => onBallot('remove')}
            >
              Remove
            </Button>
            <Button
              aria-pressed={ballot.choice === 'keep'}
              variant={ballot.choice === 'keep' ? 'filled' : 'light'}
              onClick={() => onBallot('keep')}
            >
              Keep
            </Button>
            <Button variant="subtle" disabled={ballot.choice === null} onClick={() => onBallot(null)}>
              Withdraw
            </Button>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            {ballot.reason}
          </Text>
        )}
      </Stack>
    </Section>
  );
}

/** A seat's faction information, with any vote against its player and any request for the seat. */
export function FactionInfoPanel({
  error,
  vote,
  requests,
  header,
  swapping,
  details,
  onBallot,
}: FactionInfoPanelProps) {
  return (
    <>
      {error && <FormError title="From the table">{error}</FormError>}
      {vote && <OpenVote vote={vote} onBallot={onBallot} />}
      {requests}
      <Section hiddenHeading title={header.name}>
        <Stack gap="md">
          <FactionInfoHeader model={header} />
          {swapping}
          {details && <FactionDetails faction={details} />}
        </Stack>
      </Section>
    </>
  );
}

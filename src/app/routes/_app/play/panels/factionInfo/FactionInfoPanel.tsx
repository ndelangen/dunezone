import { Group, Stack, Text } from '@mantine/core';
import type { PublicFaction } from '@shared/play/capture';
import type { RemovalVote } from '@shared/play/removal';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import type { ReactNode } from 'react';

import { FactionDetails } from './FactionDetails';
import { FactionInfoHeader } from './FactionInfoHeader';
import type { FactionInfoHeaderModel } from './FactionInfoHeader';
import { FactionInfoToolbar } from './FactionInfoToolbar';

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
  header: FactionInfoHeaderModel;
  /** The seat's trade action, while seats are traded. */
  trade: ReactNode;
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

/* The open vote's state: how far it is from a decision, how long it has been open, each ballot, and why the viewer cannot vote when they cannot. The viewer's own ballot is cast from the toolbar. */
function OpenVote({ vote }: Readonly<{ vote: RemovalVoteView }>) {
  const { ballot, elapsed } = vote;
  return (
    <Section hiddenHeading title={`Remove ${vote.target}?`}>
      <Stack gap="sm">
        <Text size="sm">
          {vote.needed.remove} more Remove or {vote.needed.keep} more Keep to decide.{' '}
          {elapsed < 1 ? 'Just opened.' : `Open ${Math.floor(elapsed / 60)}m ${elapsed % 60}s.`}
        </Text>
        <Ballots ballots={vote.ballots} />
        {'reason' in ballot && (
          <Text size="sm" c="dimmed">
            {ballot.reason}
          </Text>
        )}
      </Stack>
    </Section>
  );
}

/**
 * A seat's faction information: the header, the toolbar with every action on the seat under it, then the content.
 * The content leads with any vote against the seat's player, then what the faction starts with;
 * requests for a seat are in Seats & spectators.
 */
export function FactionInfoPanel({ error, vote, header, trade, details, onBallot }: FactionInfoPanelProps) {
  const ballot = vote && 'choice' in vote.ballot ? { choice: vote.ballot.choice, cast: onBallot } : null;
  return (
    <>
      {error && <FormError title="From the table">{error}</FormError>}
      <Section hiddenHeading title={header.name}>
        {/* The seat it shows, for a guide that points at one player's header or toolbar. */}
        <Stack gap="md" data-faction-info-seat={header.seatId}>
          <FactionInfoHeader model={header} />
          <FactionInfoToolbar
            page={header.page}
            removal={header.removal}
            allies={header.alliance?.allies}
            alliance={header.alliance?.action}
            trade={trade}
            ballot={ballot}
          />
          {vote && <OpenVote vote={vote} />}
          {details && <FactionDetails faction={details} />}
        </Stack>
      </Section>
    </>
  );
}

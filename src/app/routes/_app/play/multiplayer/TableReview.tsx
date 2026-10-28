import { Button, Group, Stack, Text } from '@mantine/core';
import { reviewRunning } from '@shared/play/review';
import type { TableReview } from '@shared/play/review';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { useState } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { CheckpointPicker } from './checkpoints/CheckpointPicker';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;
type Review = NonNullable<TableProjection['review']>;

/* How each ballot reads: agreed to look back, declined, or not cast yet. */
const BALLOT_BADGES = {
  review: { tone: 'positive', label: 'Agreed' },
  decline: { tone: 'negative', label: 'Declined' },
  uncast: { tone: 'neutral', label: 'Not voted' },
} as const;

function Ballots({ ballots }: Readonly<{ ballots: TableReview['ballots'] }>) {
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

/** A seated player's answer to an open proposal: agree or decline until the vote settles, or withdraw their own. */
function ProposalActions({
  client,
  review,
  current,
}: Readonly<{ client: TableSession; review: Review; current: TableReview }>) {
  const own = current.ballots.find((ballot) => ballot.seat === review.seat);
  if (!own) {
    return null;
  }
  const choose = (choice: 'review' | 'decline') =>
    client.command({ kind: 'review-ballot', reviewId: current.id, choice });
  return (
    <Group gap="xs" wrap="nowrap">
      {current.proposer.seat === review.seat ? (
        <Button
          size="xs"
          variant="default"
          onClick={() => client.command({ kind: 'review-end', reviewId: current.id })}
        >
          Withdraw
        </Button>
      ) : (
        <>
          <Button
            size="xs"
            aria-pressed={own.choice === 'review'}
            variant={own.choice === 'review' ? 'filled' : 'light'}
            onClick={() => choose('review')}
          >
            Agree
          </Button>
          <Button
            size="xs"
            aria-pressed={own.choice === 'decline'}
            variant={own.choice === 'decline' ? 'filled' : 'light'}
            onClick={() => choose('decline')}
          >
            Decline
          </Button>
        </>
      )}
    </Group>
  );
}

/** Ends a running review for everyone; only a seated player has it. */
function ResumePlay({
  client,
  review,
  current,
}: Readonly<{ client: TableSession; review: Review; current: TableReview }>) {
  return review.seat ? (
    <Button size="xs" onClick={() => client.command({ kind: 'review-end', reviewId: current.id })}>
      Resume play
    </Button>
  ) : null;
}

function agreedCount(current: TableReview) {
  return current.ballots.filter((ballot) => ballot.choice === 'review').length;
}

/**
 * The header while a review is asked for or runs: who asked to look back at what, and what the viewer can answer.
 * A running review replaces the stage's controls, since the table takes no move until play resumes.
 */
export function TableReviewBar({ client, table }: Props) {
  const review = table.review;
  const current = review?.current;
  if (!review || !current) {
    return null;
  }
  if (reviewRunning(current)) {
    return (
      <Group gap="xs" justify="flex-end" wrap="nowrap" role="group" aria-label="Table review in progress">
        <Text size="sm" role="status">
          Reviewing <strong>{current.context}</strong>. Play is paused for everyone.
        </Text>
        <ResumePlay client={client} review={review} current={current} />
      </Group>
    );
  }
  return (
    <Group gap="xs" justify="flex-end" wrap="nowrap" role="group" aria-label="Table review vote">
      <Text size="sm" role="status">
        {current.proposer.name} asks to review <strong>{current.context}</strong> ({agreedCount(current)} of{' '}
        {current.threshold} agreed)
      </Text>
      <ProposalActions client={client} review={review} current={current} />
    </Group>
  );
}

function Propose({ client, table, review }: Props & Readonly<{ review: Review }>) {
  const newest = review.checkpoints.at(-1);
  const [chosen, setChosen] = useState<number | null>(null);
  /* A chosen checkpoint that has since rolled out of the offered ones gives way to the newest, which the table can still review. */
  const offered = review.checkpoints.some((checkpoint) => checkpoint.step === chosen);
  const step = (offered ? chosen : null) ?? newest?.step ?? null;
  if (!review.seat) {
    return <Text size="sm">Only seated players can ask for a review.</Text>;
  }
  if (!newest) {
    return <Text size="sm">No checkpoint has been saved yet.</Text>;
  }
  return (
    <Stack gap="sm">
      <CheckpointPicker checkpoints={review.checkpoints} value={step} onChange={setChosen} />
      <Group>
        <Button
          disabled={step === null || table.reconnecting}
          onClick={() => step !== null && client.command({ kind: 'review-propose', step })}
        >
          Ask the table to review
        </Button>
      </Group>
    </Stack>
  );
}

/** The Table review tab: ask for a review, answer one, or end the one running. */
export function TableReviewPanel({ client, table, error }: Props & Readonly<{ error: string | null }>) {
  const review = table.review;
  if (!review) {
    return null;
  }
  const current = review.current;
  return (
    <Stack gap="md">
      {error && <FormError title="From the table">{error}</FormError>}
      {current ? (
        <Section hiddenHeading title={`Review of ${current.context}`}>
          <Stack gap="sm">
            <Text size="sm">
              {reviewRunning(current)
                ? `Everyone is looking at ${current.context}. Nothing on the table can be moved or peeked at until play resumes.`
                : `${current.proposer.name} asks to review ${current.context}. It starts once ${current.threshold} players agree.`}
            </Text>
            <Ballots ballots={current.ballots} />
            {reviewRunning(current) ? (
              <ResumePlay client={client} review={review} current={current} />
            ) : (
              <ProposalActions client={client} review={review} current={current} />
            )}
          </Stack>
        </Section>
      ) : (
        <Propose client={client} table={table} review={review} />
      )}
    </Stack>
  );
}

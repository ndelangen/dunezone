import { Anchor, Group, Stack, Text } from '@mantine/core';
import { reviewRunning } from '@shared/play/review';
import type { TableReview } from '@shared/play/review';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Check, History, Radio, X } from 'lucide-react';
import { useState } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { Ballots } from '../Ballots';
import { CheckpointPicker } from './checkpoints/CheckpointPicker';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;
type Review = NonNullable<TableProjection['review']>;

/* How each ballot reads: agreed to look back, declined, or not cast yet. */
const BALLOT_BADGES = {
  review: { tone: 'positive', label: 'Agreed' },
  decline: { tone: 'negative', label: 'Declined' },
  uncast: { tone: 'neutral', label: 'Not voted' },
} as const;

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
        <LabeledAction
          size="xs"
          icon={<X size={14} />}
          onClick={() => client.command({ kind: 'review-end', reviewId: current.id })}
        >
          Withdraw
        </LabeledAction>
      ) : (
        <>
          <LabeledAction
            size="xs"
            pressed={own.choice === 'review'}
            icon={<Check size={14} />}
            onClick={() => choose('review')}
          >
            Agree
          </LabeledAction>
          <LabeledAction
            size="xs"
            pressed={own.choice === 'decline'}
            icon={<X size={14} />}
            onClick={() => choose('decline')}
          >
            Decline
          </LabeledAction>
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
    <Stack gap={2} data-recall-return>
      <LabeledAction
        emphasis="strong"
        icon={<Radio size={16} />}
        onClick={() => client.command({ kind: 'review-end', reviewId: current.id })}
      >
        {review.finished ? 'End the recall' : 'Return to the game'}
      </LabeledAction>
    </Stack>
  ) : null;
}

function agreedCount(current: TableReview) {
  return current.ballots.filter((ballot) => ballot.choice === 'review').length;
}

/**
 * The header while a review is asked for or runs: who asked to look back at what, and what the viewer can answer;
 * Mentat recall links to its window, where the proposer withdraws.
 * A running review replaces the stage's controls, since the table takes no move until play resumes.
 */
export function TableReviewBar({ client, table, onOpenRecall }: Props & Readonly<{ onOpenRecall?: () => void }>) {
  const review = table.review;
  const current = review?.current;
  if (!review || !current) {
    return null;
  }
  if (reviewRunning(current)) {
    return (
      <Group gap="xs" justify="flex-end" wrap="nowrap" role="group" aria-label="Mentat recall in progress">
        <ResumePlay client={client} review={review} current={current} />
      </Group>
    );
  }
  const own = current.proposer.seat === review.seat;
  const recall = onOpenRecall ? (
    <Anchor component="button" type="button" inherit onClick={onOpenRecall}>
      Mentat recall
    </Anchor>
  ) : (
    'Mentat recall'
  );
  return (
    <Group gap="xs" justify="flex-end" align="center" wrap="nowrap" role="group" aria-label="Mentat recall vote">
      <Text size="sm" role="status">
        {own ? 'You ask' : `${current.proposer.name} asks`} to {recall} <strong>{current.context}</strong> (
        {agreedCount(current)} of {current.threshold} agreed)
      </Text>
      {!own && <ProposalActions client={client} review={review} current={current} />}
    </Group>
  );
}

function Propose({ client, table, review }: Props & Readonly<{ review: Review }>) {
  const newest = review.checkpoints.at(-1);
  const [chosen, setChosen] = useState<number | null>(null);
  /* A chosen checkpoint that has since rolled out of the offered ones gives way to the newest, which the table can still review. */
  const offered = review.checkpoints.some((checkpoint) => checkpoint.step === chosen);
  if (!review.seat) {
    return (
      <Text size="sm">
        {review.finished
          ? 'Only seated players can start a recall; you will see it when one does. Replay lets you look back alone.'
          : 'Only seated players can ask for a recall.'}
      </Text>
    );
  }
  if (!newest) {
    return <Text size="sm">No checkpoint has been saved yet.</Text>;
  }
  const step = (offered ? chosen : null) ?? newest.step;
  return (
    <Stack gap="sm">
      {review.finished && (
        <Text size="sm">
          The game is over, so no vote is needed. Everyone at the table looks at the checkpoint you pick.
        </Text>
      )}
      <CheckpointPicker checkpoints={review.checkpoints} value={step} onChange={setChosen} />
      <Group>
        <LabeledAction
          emphasis="strong"
          icon={<History size={16} />}
          disabledReason={table.reconnecting ? 'Reconnecting to the table.' : undefined}
          onClick={() => client.command({ kind: 'review-propose', step })}
        >
          {review.finished ? 'Recall together' : 'Ask the table to recall'}
        </LabeledAction>
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
        <Section hiddenHeading title={`Recall of ${current.context}`}>
          <Stack gap="sm">
            <Text size="sm">
              {reviewRunning(current)
                ? `Everyone is looking at ${current.context}. Nothing on the table can be moved or peeked at until ${review.finished ? 'the recall ends' : 'play resumes'}.`
                : `${current.proposer.name} asks to recall ${current.context}. It starts once ${current.threshold} players agree.`}
            </Text>
            {/* A finished game's recall starts without a vote, so it has no ballots to show. */}
            {!review.finished && <Ballots ballots={current.ballots} badges={BALLOT_BADGES} />}
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

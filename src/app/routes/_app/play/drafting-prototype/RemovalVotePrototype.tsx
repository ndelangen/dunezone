/*
 * Three removal-vote placements on /play/demo?variant=play&vote=A, B or C.
 * Route organs only. The public ballot contract is fixed; placement awaits Norbert's choice.
 */
import { ActionIcon, Badge, Button, Group, Select, Stack, Text } from '@mantine/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { TopicIcon } from '@ui/content/TopicIcon';
import { Surface } from '@ui/surface/Surface';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';

import { factionById, ME } from './fixture';
import { FactionToken } from './parts';
import { PlayPanel } from './PlayPanel';
import type { PlayProps } from './PlayPanel';
import styles from './RemovalVotePrototype.module.css';
import { VOTE_NAMES, VOTE_SCENARIOS, VOTE_VARIANTS, isVoteScenario } from './voting';
import type { VoteScenario, VoteVariant } from './voting';

type Ballot = 'remove' | 'keep' | null;
type Vote = {
  target: string;
  faction: string;
  ballots: Record<string, Ballot>;
  result: 'open' | 'removed' | 'retained';
};
type VoteState = {
  votes: Vote[];
  selected: string;
  left: readonly string[];
  right: readonly string[];
  openedAt: number;
};
type VoteAction =
  | { type: 'pick'; target: string }
  | { type: 'inspect'; variant: VoteVariant }
  | { type: 'left'; path: readonly string[] }
  | { type: 'right'; path: readonly string[] }
  | { type: 'ballot'; voter: string; ballot: Ballot };

function progress(vote: Vote) {
  const ballots = Object.values(vote.ballots);
  const yes = ballots.filter((ballot) => ballot === 'remove').length;
  const no = ballots.filter((ballot) => ballot === 'keep').length;
  const required = Math.ceil(ballots.length / 2) + 1;
  return { yes, no, remainingYes: required - yes, remainingNo: ballots.length - required + 1 - no };
}

function reduceVotes(state: VoteState, action: VoteAction): VoteState {
  switch (action.type) {
    case 'pick': {
      const vote = state.votes.find((item) => item.target === action.target)!;
      return { ...state, selected: action.target, right: [vote.faction, 'public'] };
    }
    case 'inspect': {
      const vote = state.votes.find((item) => item.target === state.selected)!;
      return action.variant === 'B'
        ? { ...state, left: ['log', 'audit'] }
        : { ...state, right: [vote.faction, 'public'] };
    }
    case 'left':
      return { ...state, left: action.path };
    case 'right':
      return { ...state, right: action.path };
    case 'ballot':
      return {
        ...state,
        votes: state.votes.map((vote) => {
          if (vote.target !== state.selected || vote.result !== 'open' || !(action.voter in vote.ballots)) {
            return vote;
          }
          const updated = { ...vote, ballots: { ...vote.ballots, [action.voter]: action.ballot } };
          const count = progress(updated);
          return {
            ...updated,
            result: count.remainingYes <= 0 ? 'removed' : count.remainingNo <= 0 ? 'retained' : 'open',
          };
        }),
      };
  }
}

export function RemovalVotePrototype({
  variant,
  scenario,
  state: play,
  dispatch: dispatchPlay,
  battleContent,
  battleHand,
}: PlayProps & { variant: VoteVariant; scenario: VoteScenario; battleContent: ReactNode; battleHand: ReactNode }) {
  const players = play.seats.flatMap((seat) => (seat.player ? [{ ...seat.player, faction: seat.faction }] : []));
  const viewer = scenario === 'vote-spectator' ? null : scenario === 'vote-target' ? 'twaffle' : ME;
  const [state, dispatch] = useReducer(reduceVotes, null, (): VoteState => {
    const targets = scenario === 'vote-multiple' ? ['twaffle', 'erickenneth'] : ['twaffle'];
    return {
      votes: targets.map((target): Vote => ({
        target,
        faction: players.find((player) => player.id === target)!.faction,
        ballots: Object.fromEntries(
          players
            .filter((player) => player.id !== target)
            .map((player) => [
              player.id,
              player.id === 'fectumbra' || player.id === 'argelius'
                ? 'remove'
                : scenario === 'vote-resolved' && (player.id === 'ridwan' || player.id === ME)
                  ? 'keep'
                  : null,
            ])
        ),
        result: scenario === 'vote-resolved' ? 'retained' : 'open',
      })),
      selected: 'twaffle',
      left: variant === 'B' ? ['log', 'audit'] : ['log', 'game'],
      right: ['house-atreides', variant === 'C' ? 'public' : 'thread'],
      openedAt: Date.now() - 132_000,
    };
  });
  const [seconds, tick] = useReducer(() => Math.floor((Date.now() - state.openedAt) / 1000), 132);
  useEffect(() => {
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const vote = state.votes.find((item) => item.target === state.selected)!;
  const target = players.find((player) => player.id === vote.target)!;
  const count = progress(vote);
  const canVote = viewer !== null && viewer in vote.ballots && vote.result === 'open';
  const ownBallot = viewer ? vote.ballots[viewer] : null;
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const resultText =
    vote.result === 'open'
      ? `${count.remainingYes} more Remove or ${count.remainingNo} more Keep to decide`
      : `${target.name} ${vote.result === 'removed' ? 'removed' : 'retained'}`;
  const chooseTarget =
    state.votes.length > 1 ? (
      <Select
        aria-label="Vote target"
        size="sm"
        w={200}
        value={state.selected}
        data={state.votes.map((item) => ({
          value: item.target,
          label: `Remove ${players.find((p) => p.id === item.target)!.name}`,
        }))}
        onChange={(value) => value && dispatch({ type: 'pick', target: value })}
      />
    ) : null;
  const ballotControls = canVote ? (
    <Group gap="xs" wrap="wrap" role="group" aria-label="Your ballot">
      <Button
        size="sm"
        color="red"
        variant={ownBallot === 'remove' ? 'filled' : 'light'}
        aria-pressed={ownBallot === 'remove'}
        onClick={() => dispatch({ type: 'ballot', voter: viewer!, ballot: 'remove' })}
      >
        Remove
      </Button>
      <Button
        size="sm"
        variant={ownBallot === 'keep' ? 'filled' : 'default'}
        aria-pressed={ownBallot === 'keep'}
        onClick={() => dispatch({ type: 'ballot', voter: viewer!, ballot: 'keep' })}
      >
        Keep
      </Button>
      {ownBallot ? (
        <Button size="sm" variant="subtle" onClick={() => dispatch({ type: 'ballot', voter: viewer!, ballot: null })}>
          Withdraw
        </Button>
      ) : null}
    </Group>
  ) : null;
  const ballots = players
    .filter((player) => player.id in vote.ballots)
    .map((player) => {
      const ballot = vote.ballots[player.id];
      return (
        <Group key={player.id} gap="xs" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <FactionToken faction={factionById(player.faction)} size={1.5} />
            <Text size="sm">
              {player.name}
              {player.id === viewer ? ' (you)' : ''}
            </Text>
          </Group>
          <Badge
            size="sm"
            tt="none"
            variant="light"
            color={ballot === 'remove' ? 'red' : ballot === 'keep' ? 'selected' : 'gray'}
          >
            {ballot === 'remove' ? 'Remove' : ballot === 'keep' ? 'Keep' : 'Uncast'}
          </Badge>
        </Group>
      );
    });
  const detail = (
    <Stack gap="sm" data-vote-detail={variant}>
      <Group gap="xs" justify="space-between">
        <Text size="sm" fw={600}>
          Remove {target.name}?
        </Text>
        <Badge size="sm" tt="none" variant="light" color="green">
          Vote
        </Badge>
      </Group>
      {chooseTarget}
      <Text size="sm" c="dimmed">
        {resultText}
      </Text>
      <Text size="sm" c="dimmed">
        {vote.result === 'open' ? `Open ${elapsed}` : 'Closed'}
      </Text>
      <Stack gap="xs" role="group" aria-label="Public ballots">
        {ballots}
      </Stack>
      {ballotControls}
    </Stack>
  );
  const notice = (
    <Surface withBorder={false} padding="sm" as="section" aria-label="Removal vote">
      <Stack gap="sm">
        <Group gap="sm" justify="space-between">
          <Group gap="sm">
            <TopicIcon topic="audit" size={22} />
            <Text size="sm" fw={600}>
              {state.votes.length > 1
                ? `${state.votes.filter((item) => item.result === 'open').length} removal votes`
                : `Remove ${target.name}?`}
            </Text>
            <Text size="sm" c="dimmed">
              {resultText}
            </Text>
            <Text size="sm" c="dimmed">
              {vote.result === 'open' ? `Open ${elapsed}` : 'Closed'}
            </Text>
          </Group>
          {variant === 'A' ? (
            ballotControls
          ) : (
            <Button size="sm" variant="default" onClick={() => dispatch({ type: 'inspect', variant })}>
              {variant === 'B' ? 'View in Audit' : 'View player'}
            </Button>
          )}
        </Group>
        {variant === 'A' ? (
          <>
            {chooseTarget}
            <div className={styles.barBallots} role="group" aria-label="Public ballots">
              {ballots}
            </div>
          </>
        ) : null}
      </Stack>
    </Surface>
  );
  return (
    <div className={styles.root} data-vote-variant={variant} data-vote-scenario={scenario}>
      {notice}
      <PlayPanel
        state={{ ...play, left: state.left, right: state.right }}
        dispatch={(action) => {
          if (action.type === 'setLeft') {
            dispatch({ type: 'left', path: action.path });
          } else if (action.type === 'setRight') {
            dispatch({ type: 'right', path: action.path });
          } else {
            dispatchPlay(action);
          }
        }}
        battleContent={battleContent}
        battleHand={battleHand}
        logScenario="log-latest"
        auditContent={variant === 'B' ? detail : undefined}
        playerContent={variant === 'C' ? { faction: vote.faction, content: detail } : undefined}
      />
    </div>
  );
}

export function VoteSwitcher() {
  const search = useSearch({ from: '/_app/play/demo' });
  const navigate = useNavigate();
  const variant = search.vote ?? 'A';
  const scenario = isVoteScenario(search.scenario) ? search.scenario : 'vote-open';
  const move = (direction: number) => {
    const next =
      VOTE_VARIANTS[(VOTE_VARIANTS.indexOf(variant) + direction + VOTE_VARIANTS.length) % VOTE_VARIANTS.length];
    void navigate({ to: '/play/demo', search: { ...search, vote: next, scenario }, replace: true });
  };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, button, [contenteditable="true"]')
      ) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });
  if (!import.meta.env.DEV) {
    return null;
  }
  return (
    <div className={styles.switcher} aria-label="Removal voting prototype controls">
      <Surface padding="sm" withBorder={false}>
        <Group gap="xs" wrap="nowrap">
          <ActionIcon aria-label="Previous vote variant" variant="default" onClick={() => move(-1)}>
            <ArrowLeft size={16} />
          </ActionIcon>
          <Text size="sm" fw={600}>
            {variant}: {VOTE_NAMES[variant]}
          </Text>
          <ActionIcon aria-label="Next vote variant" variant="default" onClick={() => move(1)}>
            <ArrowRight size={16} />
          </ActionIcon>
          <Select
            size="xs"
            w={120}
            aria-label="Vote scenario"
            value={scenario}
            data={VOTE_SCENARIOS.map((value) => ({ value, label: value.slice(5) }))}
            onChange={(value) =>
              isVoteScenario(value) &&
              void navigate({ to: '/play/demo', search: { ...search, scenario: value }, replace: true })
            }
          />
        </Group>
      </Surface>
    </div>
  );
}

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Group, Stack, Switch, Text, Select, NumberInput, UnstyledButton, Menu } from '@mantine/core';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { EmptyNote } from '@ui/content/EmptyNote';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { Stepper } from '@ui/control/Stepper';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface/Surface';
import { SheetPopover, TouchSurface } from '@ui/surface/TouchSheet';
import {
  ArrowLeft,
  Plus,
  Minus,
  Settings2,
  Users,
  X,
  Play,
  History,
  Layers,
  ArrowRight,
  Gavel,
  Hand,
  Mic,
  MicOff,
  QrCode,
  RotateCcw,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import { useEffect, useEffectEvent, useReducer } from 'react';
import type { CSSProperties } from 'react';

import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';

import styles from './route.module.css';

/* Throwaway review of recorded prototype H and the agreed changes, with in-memory devices and simulated voice. */
// @ts-expect-error The standalone preview registers this route outside the application route tree.
export const Route = createFileRoute('/_tool/tools/bidding-prototype')({
  component: import.meta.env.DEV ? BiddingFlowReview : () => null,
});
const steps = [
  ['setup', 'Table setup'],
  ['join', 'Join a faction'],
  ['bid', 'Bidding'],
  ['hands', 'Hand controls'],
  ['start', 'Card won'],
  ['reset', 'Reset a card'],
  ['restore', 'Resume this device'],
  ['promote', 'Recover on a phone'],
  ['over', 'Phase finished'],
] as const;
type Step = (typeof steps)[number][0];
const factions = [
  ['house-atreides', 'Atreides', '#4a4c08'],
  ['house-harkonnen', 'Harkonnen', '#151315'],
  ['emperor', 'Emperor', '#be1010'],
  ['spacing-guild', 'Spacing Guild', '#dc5317'],
  ['fremen', 'Fremen', '#e4942e'],
  ['bene-gesserit', 'Bene Gesserit', '#253b82'],
  ['ixians', 'Ixians', '#7b8c8d'],
  ['tleilaxu', 'Tleilaxu', '#73513f'],
].map(([id, name, color], i) => ({
  id,
  name,
  color,
  src: i < 6 ? `/play-fixtures/product/${id}-token.jpg` : undefined,
}));
type Seat = {
  id: string;
  name: string;
  color: string;
  src?: string;
  hand: number;
  limit: number;
  full: boolean;
  pass: boolean;
  linked: boolean;
};
type Result = { name: string; amount: number; card: number };
type State = {
  seats: Seat[];
  stage: 'setup' | 'ready' | 'active' | 'paused' | 'over';
  turn: string;
  opener: string;
  starter: string;
  high: { id: string; amount: number } | null;
  passed: string[];
  cards: number;
  card: number;
  phase: number;
  results: Result[];
  seconds: number;
  left: number;
  listen: boolean;
  speaking: boolean;
  amount: number;
  phoneAmount: number;
  remote: string | null;
  selected: string;
  code: string;
  newHost: boolean;
  opportunity: number;
  log: string[];
  note: string;
  received: string;
  recovery: boolean;
  lost: boolean;
  target: 'tablet' | 'phone';
  panel: 'bid' | 'hand' | 'limit' | 'join' | 'history' | null;
  ruleset: string;
};
const nameOf = (state: State, id: string) => state.seats.find((s) => s.id === id)?.name ?? 'Player';
function fixture(step: Step): State {
  const seats = factions.slice(0, 6).map((f, i) => ({
    ...f,
    hand: i === 1 ? 3 : i === 2 ? 4 : 1,
    limit: 4,
    full: i === 2,
    pass: false,
    linked: i === 3 || i === 4,
  }));
  let state: State = {
    seats,
    stage: 'active',
    turn: seats[3].id,
    opener: seats[1].id,
    starter: seats[3].id,
    high: { id: seats[4].id, amount: 2 },
    passed: [],
    cards: 5,
    card: 2,
    phase: 2,
    results: [{ name: 'Harkonnen', amount: 3, card: 1 }],
    seconds: 15,
    left: 15,
    listen: false,
    speaking: false,
    amount: 3,
    phoneAmount: 3,
    remote: seats[3].id,
    selected: seats[3].id,
    code: 'DUNE42',
    newHost: false,
    opportunity: 1,
    log: ['Fremen bid 2. Spacing Guild is next.'],
    note: '',
    received: '14:32:08',
    recovery: false,
    lost: false,
    target: 'tablet',
    panel: null,
    ruleset: 'Dreamrules',
  };
  if (step === 'setup' || step === 'join') {
    state = {
      ...state,
      stage: 'setup',
      high: null,
      results: [],
      card: 1,
      starter: seats[0].id,
      turn: seats[0].id,
      remote: step === 'join' ? null : seats[3].id,
      log: [],
    };
  }
  if (step === 'hands') {
    state = {
      ...state,
      turn: seats[0].id,
      seats: seats.map((s) => (s.id === seats[3].id ? { ...s, hand: 5, full: false, pass: true } : s)),
    };
  }
  if (step === 'start') {
    state = { ...won(state, seats[4].id, 2), remote: seats[4].id, selected: seats[4].id };
  }
  if (step === 'reset') {
    state = reset(state);
  }
  if (step === 'restore') {
    state = { ...state, stage: 'paused', note: 'Restored on this device. Check the table, then Resume.' };
  }
  if (step === 'promote') {
    state = { ...state, lost: true, recovery: true };
  }
  if (step === 'over') {
    state = {
      ...won(state, seats[4].id, 2),
      stage: 'over',
      card: 3,
      note: 'Everyone passed on the next card. Return the unsold cards.',
    };
  }
  return state;
}
function nextNonFull(state: State, after: string) {
  const start = state.seats.findIndex((s) => s.id === after);
  return (
    Array.from({ length: state.seats.length }, (_, i) => state.seats[(start + i + 1) % state.seats.length]).find(
      (s) => !s.full
    )?.id ?? after
  );
}
function won(state: State, winner: string, amount: number): State {
  const seats = state.seats.map((s) => (s.id === winner ? { ...s, hand: s.hand + 1, full: s.hand + 1 >= s.limit } : s));
  const result = { name: nameOf(state, winner), amount, card: state.card };
  const next = {
    ...state,
    seats,
    results: [...state.results, result],
    card: state.card + 1,
    high: null,
    passed: [],
    opportunity: state.opportunity + 1,
    note: `${result.name} won card ${result.card} for ${amount} spice. Hand count +1.`,
    log: [`${result.name} won for ${amount}. Hand count +1.`, ...state.log],
  };
  return { ...next, stage: state.card >= state.cards ? 'over' : 'ready', starter: nextNonFull(next, state.opener) };
}
function reset(state: State): State {
  if (state.stage === 'over' || state.stage === 'ready' || state.stage === 'setup') {
    return state;
  }
  return {
    ...state,
    stage: 'ready',
    high: null,
    passed: [],
    starter: nextNonFull(state, state.opener),
    opportunity: state.opportunity + 1,
    recovery: false,
    note: 'Current auction reset. Counts, completed wins and settings kept.',
    log: ['Current card reset.', ...state.log],
  };
}
function advance(state: State, after: string): State {
  const start = state.seats.findIndex((s) => s.id === after);
  let passed = [...state.passed];
  for (let i = 1; i <= state.seats.length; i++) {
    const s = state.seats[(start + i) % state.seats.length];
    if (s.full || s.id === state.high?.id || passed.includes(s.id)) {
      continue;
    }
    if (s.pass) {
      passed.push(s.id);
      continue;
    }
    return {
      ...state,
      passed,
      turn: s.id,
      amount: (state.high?.amount ?? 0) + 1,
      phoneAmount: (state.high?.amount ?? 0) + 1,
      left: state.seconds,
    };
  }
  return state.high
    ? won({ ...state, passed }, state.high.id, state.high.amount)
    : {
        ...state,
        passed,
        stage: 'over',
        note: 'Everyone passed. Return this card and the remaining cards.',
        opportunity: state.opportunity + 1,
      };
}
type Event =
  | { type: 'scenario'; step: Step }
  | { type: 'edit'; id: string; field: 'hand' | 'limit' | 'full' | 'pass'; value: number | boolean }
  | { type: 'bid' | 'pass'; opportunity: number; id: string; amount?: number; source: string }
  | {
      type: 'field';
      field:
        | 'amount'
        | 'phoneAmount'
        | 'cards'
        | 'seconds'
        | 'starter'
        | 'selected'
        | 'listen'
        | 'speaking'
        | 'remote'
        | 'panel'
        | 'ruleset';
      value: number | string | boolean | null;
    }
  | {
      type:
        | 'start'
        | 'reset'
        | 'resume'
        | 'promote'
        | 'rejoin'
        | 'recover'
        | 'next-phase'
        | 'win'
        | 'timeout'
        | 'no-phones';
    }
  | { type: 'seats'; ids: string[] }
  | { type: 'remove'; id: string }
  | { type: 'add'; id: string };
function reducer(state: State, event: Event): State {
  if (event.type === 'scenario') {
    return fixture(event.step);
  }
  if (event.type === 'field') {
    return {
      ...state,
      [event.field]: event.value,
      ...(event.field === 'remote'
        ? {
            seats: state.seats.map((s) => ({
              ...s,
              linked: s.id === event.value ? true : s.id === state.remote ? false : s.linked,
            })),
          }
        : {}),
    } as State;
  }
  if (event.type === 'no-phones') {
    return { ...state, seats: state.seats.map((s) => ({ ...s, linked: false })), remote: null };
  }
  if (event.type === 'edit') {
    return {
      ...state,
      seats: state.seats.map((s) => {
        if (s.id !== event.id) {
          return s;
        }
        const next = { ...s, [event.field]: event.value } as Seat;
        if (event.field === 'hand' || event.field === 'limit') {
          next.full = next.hand >= next.limit;
        }
        return next;
      }),
    };
  }
  if (event.type === 'reset') {
    return reset(state);
  }
  if (event.type === 'start') {
    const next = {
      ...state,
      stage: 'active' as const,
      high: null,
      passed: [],
      turn: state.starter,
      opener: state.starter,
      amount: 1,
      phoneAmount: 1,
      left: state.seconds,
      opportunity: state.opportunity + 1,
      note: '',
    };
    const first = next.seats.find((s) => s.id === next.starter);
    return first?.full || first?.pass
      ? advance({ ...next, passed: first?.pass ? [first.id] : [] }, next.starter)
      : next;
  }
  if (event.type === 'bid' || event.type === 'pass') {
    const stale = event.opportunity !== state.opportunity || event.id !== state.turn;
    if (state.stage !== 'active' || stale) {
      return {
        ...state,
        log: [`${event.source}: not applied. That turn has ended or is paused.`, ...state.log].slice(0, 4),
      };
    }
    if (event.type === 'bid' && (event.amount ?? 0) <= (state.high?.amount ?? 0)) {
      return { ...state, log: [`Bid at least ${(state.high?.amount ?? 0) + 1}.`, ...state.log] };
    }
    return advance(
      {
        ...state,
        high: event.type === 'bid' ? { id: state.turn, amount: event.amount! } : state.high,
        passed: event.type === 'bid' ? [] : [...state.passed, state.turn],
        opportunity: state.opportunity + 1,
        log: [
          `${event.source}: ${nameOf(state, state.turn)} ${event.type === 'bid' ? `bid ${event.amount}` : 'passed'}.`,
          ...state.log,
        ].slice(0, 4),
      },
      state.turn
    );
  }
  if (event.type === 'timeout') {
    return reducer(state, { type: 'pass', id: state.turn, opportunity: state.opportunity, source: 'Timer' });
  }
  if (event.type === 'win') {
    return won(state, state.high?.id ?? state.turn, state.high?.amount ?? 1);
  }
  if (event.type === 'recover') {
    return { ...state, recovery: true };
  }
  if (event.type === 'promote') {
    return {
      ...state,
      stage: 'paused',
      newHost: true,
      code: 'SAND73',
      remote: null,
      seats: state.seats.map((s) => ({ ...s, linked: false })),
      target: 'phone',
      lost: false,
      opportunity: state.opportunity + 1,
      note: 'Recovered from this phone. Check the saved table, then Resume.',
    };
  }
  if (event.type === 'resume') {
    return {
      ...state,
      stage: 'active',
      left: state.seconds,
      recovery: false,
      opportunity: state.opportunity + 1,
      note: 'Resumed with a fresh full timer.',
    };
  }
  if (event.type === 'rejoin') {
    return {
      ...state,
      remote: state.seats[0].id,
      seats: state.seats.map((s) => ({ ...s, linked: s.id === state.seats[0].id })),
      note: 'Atreides rejoined using the new code.',
    };
  }
  if (event.type === 'next-phase') {
    return {
      ...state,
      stage: 'setup',
      cards: state.seats.filter((s) => !s.full).length,
      card: 1,
      phase: state.phase + 1,
      high: null,
      passed: [],
      starter: nextNonFull(state, state.seats.at(-1)!.id),
      note: '',
      opportunity: state.opportunity + 1,
    };
  }
  if (event.type === 'seats') {
    return { ...state, seats: event.ids.map((id) => state.seats.find((s) => s.id === id)!) };
  }
  if (event.type === 'remove' && state.seats.length > 2) {
    const seats = state.seats.filter((s) => s.id !== event.id);
    const fallback = seats.find((s) => !s.full)?.id ?? seats[0].id;
    return {
      ...state,
      seats,
      starter: state.starter === event.id ? fallback : state.starter,
      turn: state.turn === event.id ? fallback : state.turn,
      opener: state.opener === event.id ? fallback : state.opener,
      selected: state.selected === event.id ? fallback : state.selected,
      remote: state.remote === event.id ? null : state.remote,
    };
  }
  if (event.type === 'add') {
    const f = factions.find((f) => f.id === event.id);
    if (f && !state.seats.some((s) => s.id === f.id)) {
      return {
        ...state,
        seats: [...state.seats, { ...f, hand: 1, limit: 4, full: false, pass: false, linked: false }],
      };
    }
  }
  return state;
}
const descriptions: Record<Step, string> = {
  setup:
    'Configure the circle to match the real seats. The suggested card count uses non-full factions; players can change it.',
  join: 'Scan the table code, then choose a faction. Players without phones use the tablet or voice.',
  bid: 'The circle stays fixed. Counts remain visible, and all three input methods share the same turn.',
  hands:
    'Full and persistent pass are separate. Change a count or limit to see Full recalculate; switch Full off even above the limit.',
  start:
    'A win adds one card. Wait here until the table starts the next auction. The starter follows the last starter, not the winner.',
  reset: 'Reset clears the current auction. Hand information, completed wins and table setup stay.',
  restore: 'The same device keeps its code, bid and bidder. Check the table, then Resume with a fresh timer.',
  promote:
    'Use the selected phone’s latest received copy. It becomes central with a new code; other phones rejoin before play continues.',
  over: 'Keep the results visible. Start a later phase with a fresh suggested card count and the same hand settings.',
};
function BiddingFlowReview() {
  const search = useSearch({ strict: false }) as { variant?: string; step?: string; view?: string; focus?: string };
  const navigate = useNavigate();
  const step = steps.some(([key]) => key === search.step) ? (search.step as Step) : 'bid';
  const before = search.variant === 'before';
  const view = search.view ?? 'both';
  const [state, dispatch] = useReducer(reducer, step, fixture);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const setPanel = (value: State['panel']) => dispatch({ type: 'field', field: 'panel', value });
  useEffect(() => {
    dispatch({ type: 'scenario', step });
  }, [step]);
  const setSearch = (change: Record<string, string>) =>
    void navigate({ to: '.', search: { ...search, ...change } as never, replace: true });
  const cycle = (delta: number) => {
    const i = steps.findIndex(([key]) => key === step);
    setSearch({ step: steps[(i + delta + steps.length) % steps.length][0] });
  };
  const cycleFromKey = useEffectEvent(cycle);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],button,[role="switch"]')) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        cycleFromKey(e.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const bidAction = (source: string, kind: 'bid' | 'pass', amount = state.amount, id = state.turn) =>
    dispatch({ type: kind, opportunity: state.opportunity, id, amount, source });
  const handControls = (id: string) => {
    const seat = state.seats.find((s) => s.id === id) ?? state.seats[0];
    return (
      <Stack gap="md">
        <CountControl
          label={`${seat.name} hand count`}
          title="Cards in hand"
          value={seat.hand}
          onChange={(value) => dispatch({ type: 'edit', id: seat.id, field: 'hand', value })}
        />
        <CountControl
          label={`${seat.name} hand limit`}
          title="Hand limit"
          value={seat.limit}
          onChange={(value) => dispatch({ type: 'edit', id: seat.id, field: 'limit', value })}
        />
        <Group grow>
          <Switch
            size="md"
            label="Full"
            aria-label={`${seat.name} Full`}
            checked={seat.full}
            onChange={(e) => dispatch({ type: 'edit', id: seat.id, field: 'full', value: e.currentTarget.checked })}
          />
          <Switch
            size="md"
            label="Always pass"
            aria-label={`${seat.name} Always pass`}
            checked={seat.pass}
            onChange={(e) => dispatch({ type: 'edit', id: seat.id, field: 'pass', value: e.currentTarget.checked })}
          />
        </Group>
        <Text size="sm" c="dimmed">
          Count or limit edits recalculate Full. Always pass stays on until you switch it off.
        </Text>
      </Stack>
    );
  };
  const pad = (source: string, id = state.turn) => (
    <Stack gap="sm">
      <CountControl
        label={`${source} bid amount`}
        title="Your bid"
        value={source === 'Phone' ? state.phoneAmount : state.amount}
        min={(state.high?.amount ?? 0) + 1}
        onChange={(value) => dispatch({ type: 'field', field: source === 'Phone' ? 'phoneAmount' : 'amount', value })}
      />
      <Group grow wrap="nowrap">
        <LabeledAction
          size="lg"
          icon={<Hand size={21} />}
          onClick={() => bidAction(source, 'pass', source === 'Phone' ? state.phoneAmount : state.amount, id)}
        >
          Pass
        </LabeledAction>
        <LabeledAction
          size="lg"
          intent="positive"
          emphasis="strong"
          icon={<Gavel size={21} />}
          onClick={() => bidAction(source, 'bid', source === 'Phone' ? state.phoneAmount : state.amount, id)}
        >
          {`Bid ${source === 'Phone' ? state.phoneAmount : state.amount}`}
        </LabeledAction>
      </Group>
      <LabeledAction
        size="md"
        icon={<Plus size={18} />}
        onClick={() => bidAction(source, 'bid', (state.high?.amount ?? 0) + 1, id)}
      >
        One more
      </LabeledAction>
    </Stack>
  );
  const starterControl = (
    <Stack gap="sm">
      <ControlBlock
        title="Start new bid at"
        input={
          <Select
            size="md"
            aria-label="Start new bid at"
            value={state.starter}
            data={state.seats.map((s) => ({ value: s.id, label: `${s.name}${s.full ? ' · Full' : ''}` }))}
            onChange={(value) => value && dispatch({ type: 'field', field: 'starter', value })}
          />
        }
      />
      <LabeledAction
        size="lg"
        intent="positive"
        emphasis="strong"
        icon={<Play size={20} />}
        onClick={() => dispatch({ type: 'start' })}
      >
        Start new bid
      </LabeledAction>
    </Stack>
  );
  const results = (
    <Stack gap="xs">
      {state.results.map((r, i) => (
        <Text size="sm" key={`${r.card}-${i}`}>
          Card {r.card} · {r.name} · {r.amount} spice
        </Text>
      ))}
      {state.results.length === 0 && <EmptyNote>No completed wins yet.</EmptyNote>}
    </Stack>
  );
  const qr = (
    <Group gap="md" align="center">
      <div className={styles.qr}>
        <QrCode size={80} aria-label="QR code placeholder" />
      </div>
      <Stack gap="xs">
        <Text fw={700} size="xl">
          {state.code}
        </Text>
        <Text size="sm">Scan, then choose your faction.</Text>
        <Text size="xs" c="dimmed">
          QR preview
        </Text>
      </Stack>
    </Group>
  );
  function circle(baseline = false) {
    const game = baseline ? fixture('bid') : state;
    const current = game.stage === 'ready' || game.stage === 'setup' ? game.starter : game.turn;
    const angle = (game.seats.findIndex((s) => s.id === current) * 360) / game.seats.length;
    return (
      <div className={styles.arena} data-baseline={baseline || undefined}>
        {game.stage !== 'over' && (
          <svg className={styles.arrow} viewBox="0 0 100 100" aria-label={`Bidder pointer: ${nameOf(game, current)}`}>
            <path d="M50 34 L50 29 M47 31 L50 27 L53 31" transform={`rotate(${angle} 50 50)`} />
          </svg>
        )}
        <div className={styles.cardMiddle}>
          {baseline ? (
            <img src="/play-fixtures/dreamrules/cardback.jpg" alt="Physical Treachery card, shown face down" />
          ) : game.stage === 'over' ? (
            <Text fw={700}>Bidding is over</Text>
          ) : (
            <>
              <Text size="sm" c="dimmed">
                {game.stage === 'setup' || game.stage === 'ready'
                  ? 'Starts at'
                  : game.stage === 'paused'
                    ? 'Paused'
                    : 'To bid'}
              </Text>
              <Text className={styles.currentBidder} fw={700}>
                {nameOf(game, current)}
              </Text>
              {game.stage === 'active' || game.stage === 'paused' ? (
                <>
                  <Text className={styles.highAmount} fw={700}>
                    {game.high?.amount ?? '0'}
                  </Text>
                  <Text size="sm">{game.high ? `${nameOf(game, game.high.id)} · spice` : 'No bid yet'}</Text>
                  <Text size="sm" c="dimmed">
                    {game.stage === 'paused' ? 'Waiting for Resume' : game.seconds ? `${game.left}s` : 'Timer off'}
                  </Text>
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  Tap a faction to change
                </Text>
              )}
            </>
          )}
          {baseline && (
            <Text size="xs">
              Card {game.card} of {game.cards}
            </Text>
          )}
        </div>
        {game.seats.map((s, i) => {
          const active = game.stage !== 'over' && s.id === current;
          const seatAngle = (i * Math.PI * 2) / game.seats.length - Math.PI / 2;
          return (
            <UnstyledButton
              key={s.id}
              disabled={baseline}
              className={styles.seat}
              data-active={active || undefined}
              style={
                { left: `${50 + Math.cos(seatAngle) * 39}%`, top: `${50 + Math.sin(seatAngle) * 39}%` } as CSSProperties
              }
              aria-label={`${s.name}, ${s.hand} cards${s.full ? ', Full' : ''}`}
              onClick={() => {
                if (game.stage === 'setup' || game.stage === 'ready') {
                  dispatch({ type: 'field', field: 'starter', value: s.id });
                } else {
                  dispatch({ type: 'field', field: 'selected', value: s.id });
                  setPanel('hand');
                }
              }}
            >
              <FactionTokenFace
                token={s}
                size={48}
                style={{
                  width: 'var(--seat-token-size)',
                  height: 'var(--seat-token-size)',
                  minWidth: 'var(--seat-token-size)',
                }}
                aria-hidden
              />
              <div className={styles.seatWords}>
                <Text className={styles.seatName} fw={700}>
                  {s.name}
                </Text>
                <div className={styles.handTotal}>
                  {baseline ? (
                    <Text>
                      {s.full
                        ? 'Full'
                        : `${s.id === 'house-harkonnen' ? 4 : s.hand}/${s.id === 'house-harkonnen' ? 8 : 4}`}
                    </Text>
                  ) : (
                    <>
                      <strong>{s.hand}</strong>
                      <span>/ {s.limit}</span>
                    </>
                  )}
                </div>
                {!baseline && (
                  <Text className={styles.seatStatus} size="sm">
                    {[s.full && 'Full', s.pass && 'Always pass'].filter(Boolean).join(' · ') ||
                      (active ? 'To bid' : 'cards')}
                  </Text>
                )}
              </div>
            </UnstyledButton>
          );
        })}
      </div>
    );
  }
  const tableSetup = (
    <Stack gap="md">
      <Section title="Set up the table">
        <Text size="sm">Match the seat order, then tap the first bidder on the circle.</Text>
      </Section>
      <ControlBlock
        title="Ruleset"
        input={
          <Select
            aria-label="Ruleset"
            value={state.ruleset}
            data={['Dreamrules', 'GF9']}
            onChange={(value) => value && dispatch({ type: 'field', field: 'ruleset', value })}
          />
        }
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          const from = state.seats.findIndex((s) => s.id === active.id);
          const to = state.seats.findIndex((s) => s.id === over?.id);
          if (from >= 0 && to >= 0 && from !== to) {
            dispatch({
              type: 'seats',
              ids: arrayMove(
                state.seats.map((s) => s.id),
                from,
                to
              ),
            });
          }
        }}
      >
        <SortableContext items={state.seats.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className={styles.seatList}>
            {state.seats.map((s) => (
              <SortableItem key={s.id} as="li" id={s.id}>
                {(handle) => (
                  <Group wrap="nowrap" gap="sm">
                    <SortableReorderHandle label={`Move ${s.name}`} emphasis="silent" {...handle} />
                    <FactionTokenFace token={s} size={32} aria-hidden />
                    <Text className={styles.grow} size="sm">
                      {s.name}
                    </Text>
                    <IconAction
                      label={`Remove ${s.name}`}
                      size="xl"
                      emphasis="quiet"
                      icon={<X size={18} />}
                      disabledReason={state.seats.length <= 2 ? 'Keep at least two factions.' : undefined}
                      onClick={() => dispatch({ type: 'remove', id: s.id })}
                    />
                  </Group>
                )}
              </SortableItem>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <ControlBlock
        title="Add a faction"
        input={
          <Select
            aria-label="Add a faction"
            placeholder="Choose a faction"
            value={null}
            data={factions
              .filter((f) => !state.seats.some((s) => s.id === f.id))
              .map((f) => ({ value: f.id, label: f.name }))}
            onChange={(id) => id && dispatch({ type: 'add', id })}
          />
        }
      />
      <Group grow align="start">
        <ControlBlock
          title="Cards this phase"
          input={
            <NumberInput
              aria-label="Cards this phase"
              value={state.cards}
              min={1}
              allowDecimal={false}
              onChange={(value) => dispatch({ type: 'field', field: 'cards', value: Number(value) })}
            />
          }
        />
        <ControlBlock
          title="Bid timer"
          input={
            <Select
              aria-label="Bid timer"
              value={String(state.seconds)}
              data={[
                { value: '0', label: 'Off' },
                ...Array.from({ length: 14 }, (_, i) => ({
                  value: String((i + 1) * 5),
                  label: `${(i + 1) * 5} seconds`,
                })),
              ]}
              onChange={(value) => dispatch({ type: 'field', field: 'seconds', value: Number(value) })}
            />
          }
        />
      </Group>
      <Text size="sm" c="dimmed">
        Suggested: {state.seats.filter((s) => !s.full).length} cards, one per non-full faction.
      </Text>
      {starterControl}
    </Stack>
  );
  const tablet = (
    <TouchSurface>
      <div className={styles.tablet} data-testid="tablet-screen">
        <header className={styles.deviceHeader}>
          <div className={styles.grow}>
            <Text fw={700}>Turn {state.phase} · Bidding</Text>
            <Text size="sm" c="dimmed">
              {state.stage === 'over' ? 'Phase complete' : `Card ${state.card} of ${state.cards}`} · {state.ruleset}
            </Text>
          </div>
          <IconAction
            size="xl"
            emphasis="quiet"
            label="Toggle listening"
            pressed={state.listen}
            icon={state.listen ? <Mic size={21} /> : <MicOff size={21} />}
            onClick={() => dispatch({ type: 'field', field: 'listen', value: !state.listen })}
          />
          <IconAction
            size="xl"
            emphasis="quiet"
            label="Toggle announcements"
            pressed={state.speaking}
            icon={state.speaking ? <Volume2 size={21} /> : <VolumeX size={21} />}
            onClick={() => dispatch({ type: 'field', field: 'speaking', value: !state.speaking })}
          />
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <IconAction size="xl" emphasis="quiet" label="Table controls" icon={<Settings2 size={21} />} />
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<QrCode size={18} />} onClick={() => setPanel('join')}>
                Join code · {state.code}
              </Menu.Item>
              <Menu.Item leftSection={<Layers size={18} />} onClick={() => setPanel('hand')}>
                Hand controls
              </Menu.Item>
              <Menu.Item leftSection={<History size={18} />} onClick={() => setPanel('history')}>
                Completed wins
              </Menu.Item>
              <Menu.Item
                leftSection={<RotateCcw size={18} />}
                disabled={!['active', 'paused'].includes(state.stage)}
                onClick={() => dispatch({ type: 'reset' })}
              >
                Reset this card
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </header>
        <div className={styles.tabletBody} data-setup={state.stage === 'setup' || undefined}>
          <div className={styles.circleColumn}>{circle()}</div>
          {state.stage === 'setup' && <div className={styles.controlColumn}>{tableSetup}</div>}
        </div>
        <footer className={styles.tabletFooter}>
          {state.stage === 'active' ? (
            <>
              <Text size="sm" c="dimmed" className={styles.grow} aria-live="polite">
                {state.log[0] || 'Tap a faction to adjust its hand.'}
              </Text>
              <LabeledAction
                size="lg"
                icon={<Gavel size={20} />}
                onClick={() => setPanel('bid')}
              >{`Bid for ${nameOf(state, state.turn)}`}</LabeledAction>
            </>
          ) : state.stage === 'ready' ? (
            <>
              <div className={styles.grow}>
                <Text fw={700}>{state.note}</Text>
                <Text size="sm" c="dimmed">
                  Tap a faction to change the next starter.
                </Text>
              </div>
              <LabeledAction
                size="lg"
                intent="positive"
                emphasis="strong"
                icon={<Play size={20} />}
                onClick={() => dispatch({ type: 'start' })}
              >
                Start new bid
              </LabeledAction>
            </>
          ) : state.stage === 'paused' ? (
            <>
              <div className={styles.grow}>
                <Text fw={700}>Check the table, then Resume</Text>
                <Text size="sm" c="dimmed">
                  {state.seconds ? `Fresh ${state.seconds}s timer on Resume.` : 'Timer off.'}
                </Text>
              </div>
              <LabeledAction
                size="lg"
                intent="positive"
                emphasis="strong"
                icon={<Play size={20} />}
                onClick={() => dispatch({ type: 'resume' })}
              >
                Resume
              </LabeledAction>
            </>
          ) : state.stage === 'over' ? (
            <>
              <div className={styles.grow}>
                <Text fw={700}>{state.note}</Text>
                {results}
              </div>
              <LabeledAction
                size="lg"
                intent="positive"
                emphasis="strong"
                icon={<ArrowRight size={20} />}
                onClick={() => dispatch({ type: 'next-phase' })}
              >{`Set up turn ${state.phase + 1}`}</LabeledAction>
            </>
          ) : (
            <LabeledAction
              icon={<QrCode size={20} />}
              onClick={() => setPanel('join')}
            >{`Join table ${state.code}`}</LabeledAction>
          )}
        </footer>
      </div>
    </TouchSurface>
  );
  const remoteSeat = state.seats.find((s) => s.id === state.remote);
  const remote = (
    <TouchSurface>
      <div className={styles.phone} data-testid="phone-screen">
        <header className={styles.deviceHeader}>
          {remoteSeat && <FactionTokenFace token={remoteSeat} size={40} aria-hidden />}
          <div className={styles.grow}>
            <Text fw={700}>{state.newHost ? 'Central device' : (remoteSeat?.name ?? 'Join the table')}</Text>
            <Text size="xs" c="dimmed">
              {state.lost ? 'Tablet unavailable' : `Table ${state.code}`}
            </Text>
          </div>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <IconAction label="Remote settings" size="xl" emphasis="quiet" icon={<Settings2 size={21} />} />
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Users size={18} />}
                onClick={() => dispatch({ type: 'field', field: 'remote', value: null })}
              >
                Change faction
              </Menu.Item>
              <Menu.Item
                leftSection={<RotateCcw size={18} />}
                disabled={!['active', 'paused'].includes(state.stage)}
                onClick={() => dispatch({ type: 'reset' })}
              >
                Reset this card
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </header>
        {state.recovery ? (
          <div className={styles.phoneScroll}>
            <Stack gap="md">
              <Section title={state.newHost ? 'Check the recovered table' : 'Tablet unavailable'}>
                <Text size="sm">
                  {state.newHost ? 'This phone is now the central device.' : 'A saved copy is available on this phone.'}
                </Text>
              </Section>
              <Text size="sm">
                Copy received at {state.received} · Turn {state.phase} · {state.ruleset}
              </Text>
              <Text size="sm">
                {state.seconds ? `${state.seconds}s per bidder. Resume gives a fresh full timer.` : 'Timer off.'}
              </Text>
              <Text size="sm" c="dimmed">
                This is the latest copy this phone received. Check it against the physical table.
              </Text>
              <Text fw={700}>
                Card {state.card} of {state.cards} · {nameOf(state, state.turn)} to bid
              </Text>
              <Text>{state.high ? `${nameOf(state, state.high.id)} has ${state.high.amount}` : 'No bid yet'}</Text>
              <div className={styles.compactHands}>
                {state.seats.map((s) => (
                  <Text size="sm" key={s.id}>
                    {s.name} · {s.hand}/{s.limit}
                    {s.full ? ' · Full' : ''}
                    {s.pass ? ' · Always pass' : ''}
                  </Text>
                ))}
              </div>
              <Section title="Completed wins">{results}</Section>
              {state.newHost ? (
                <>
                  {qr}
                  <Text size="sm">Other phones scan the new code and choose their factions again.</Text>
                  <Text size="sm">{state.seats.filter((s) => s.linked).length} phones rejoined</Text>
                  <LabeledAction icon={<Layers size={18} />} onClick={() => setPanel('hand')}>
                    Check or correct a hand
                  </LabeledAction>
                  <LabeledAction icon={<RotateCcw size={18} />} onClick={() => dispatch({ type: 'reset' })}>
                    Reset this card
                  </LabeledAction>
                  <LabeledAction
                    size="lg"
                    icon={<Play size={20} />}
                    intent="positive"
                    emphasis="strong"
                    onClick={() => dispatch({ type: 'resume' })}
                  >
                    Resume
                  </LabeledAction>
                </>
              ) : (
                <LabeledAction
                  size="lg"
                  icon={<Play size={20} />}
                  intent="positive"
                  emphasis="strong"
                  onClick={() => dispatch({ type: 'promote' })}
                >
                  Use this phone as central
                </LabeledAction>
              )}
            </Stack>
          </div>
        ) : !remoteSeat ? (
          <div className={styles.phoneScroll}>
            <Stack gap="sm">
              <Section title="Choose your faction">
                <Text size="sm">Table {state.code}</Text>
              </Section>
              {state.seats.map((s) => (
                <LabeledAction
                  key={s.id}
                  size="lg"
                  justify="start"
                  icon={<FactionTokenFace token={s} size={30} aria-hidden />}
                  onClick={() => dispatch({ type: 'field', field: 'remote', value: s.id })}
                >{`${s.name}${s.linked ? ' · phone linked' : ''}`}</LabeledAction>
              ))}
            </Stack>
          </div>
        ) : (
          <>
            <div className={styles.phoneScroll}>
              <div className={styles.phoneBid} aria-live="polite">
                <Text size="sm" c="dimmed">
                  {state.stage === 'over' ? 'Phase complete' : `Card ${state.card} of ${state.cards}`}
                </Text>
                <Text className={styles.phoneTurn} fw={700}>
                  {state.stage === 'active'
                    ? state.turn === remoteSeat.id
                      ? 'Your turn'
                      : `${nameOf(state, state.turn)} to bid`
                    : state.stage === 'ready'
                      ? 'Start new bid'
                      : state.stage === 'paused'
                        ? 'Table paused'
                        : state.stage === 'over'
                          ? 'Bidding is over'
                          : 'Waiting for the table'}
                </Text>
                {state.stage === 'active' ? (
                  <>
                    <Text className={styles.phoneHigh} fw={700}>
                      {state.high?.amount ?? '0'}
                    </Text>
                    <Text size="sm">{state.high ? `${nameOf(state, state.high.id)} · spice` : 'No bid yet'}</Text>
                    <Text size="sm" c="dimmed">
                      {state.seconds ? `${state.left}s` : 'Timer off'}
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    {state.note || 'Your hand controls are available.'}
                  </Text>
                )}
                {state.log[0]?.startsWith('Phone:') && (
                  <Text size="xs" c="dimmed">
                    {state.log[0]}
                  </Text>
                )}
              </div>
              <div className={styles.handSection}>
                <CountControl
                  label={`${remoteSeat.name} hand count`}
                  title="Your cards"
                  value={remoteSeat.hand}
                  onChange={(value) => dispatch({ type: 'edit', id: remoteSeat.id, field: 'hand', value })}
                />
                <Group justify="space-between" wrap="nowrap" className={styles.statusControls}>
                  <Switch
                    size="md"
                    label="Full"
                    aria-label={`${remoteSeat.name} Full`}
                    checked={remoteSeat.full}
                    onChange={(e) =>
                      dispatch({ type: 'edit', id: remoteSeat.id, field: 'full', value: e.currentTarget.checked })
                    }
                  />
                  <Switch
                    size="md"
                    label="Always pass"
                    aria-label={`${remoteSeat.name} Always pass`}
                    checked={remoteSeat.pass}
                    onChange={(e) =>
                      dispatch({ type: 'edit', id: remoteSeat.id, field: 'pass', value: e.currentTarget.checked })
                    }
                  />
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Hand limit {remoteSeat.limit}
                  </Text>
                  <IconAction
                    label="Adjust hand limit"
                    icon={<Settings2 size={18} />}
                    size="xl"
                    emphasis="quiet"
                    onClick={() => setPanel('limit')}
                  />
                </Group>
              </div>
            </div>
            <footer className={styles.phoneDock}>
              {state.stage === 'active' && state.remote === state.turn ? (
                pad('Phone', remoteSeat.id)
              ) : state.stage === 'ready' ? (
                starterControl
              ) : (
                <Text size="sm" ta="center" c="dimmed">
                  {state.stage === 'active'
                    ? 'Your controls appear when it is your turn.'
                    : state.stage === 'paused'
                      ? 'Check the central display, then Resume.'
                      : state.stage === 'setup'
                        ? 'The table is being set up.'
                        : 'Waiting for the next phase.'}
                </Text>
              )}
            </footer>
          </>
        )}
      </div>
    </TouchSurface>
  );
  const panelLabel =
    state.panel === 'bid'
      ? `${nameOf(state, state.turn)} to bid`
      : state.panel === 'hand'
        ? 'Hand controls'
        : state.panel === 'limit'
          ? 'Hand limit'
          : state.panel === 'history'
            ? 'Completed wins'
            : 'Join the table';
  const panel = (
    <TouchSurface>
      <SheetPopover opened={state.panel !== null} onChange={(open) => !open && setPanel(null)}>
        <SheetPopover.Dropdown label={panelLabel}>
          <div className={styles.sheetContent}>
            {state.panel === 'bid' ? (
              state.stage === 'active' ? (
                <Stack gap="md">
                  <Section title={`${nameOf(state, state.turn)} to bid`}>
                    <Text size="sm">
                      {state.high ? `${nameOf(state, state.high.id)} has ${state.high.amount}` : 'Open the bidding'}
                      {state.seconds ? ` · ${state.left}s` : ' · Timer off'}
                    </Text>
                  </Section>
                  {pad('Tablet')}
                  <LabeledAction
                    icon={<RotateCcw size={18} />}
                    onClick={() => {
                      dispatch({ type: 'reset' });
                      setPanel(null);
                    }}
                  >
                    Reset this card
                  </LabeledAction>
                </Stack>
              ) : (
                <Text>{state.note || 'The auction changed. Close this panel to continue.'}</Text>
              )
            ) : state.panel === 'hand' ? (
              <Stack gap="md">
                <Select
                  aria-label="Faction to edit"
                  size="md"
                  value={state.selected}
                  data={state.seats.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={(value) => value && dispatch({ type: 'field', field: 'selected', value })}
                />
                {handControls(state.selected)}
              </Stack>
            ) : state.panel === 'limit' && remoteSeat ? (
              <CountControl
                title="Hand limit"
                label={`${remoteSeat.name} hand limit`}
                value={remoteSeat.limit}
                onChange={(value) => dispatch({ type: 'edit', id: remoteSeat.id, field: 'limit', value })}
              />
            ) : state.panel === 'history' ? (
              results
            ) : (
              qr
            )}
            {state.panel === 'bid' && (
              <div className={styles.actionRecord} aria-live="polite">
                {state.log.slice(0, 3).map((line, i) => (
                  <Text key={i} size="sm" c="dimmed">
                    {line}
                  </Text>
                ))}
              </div>
            )}
          </div>
        </SheetPopover.Dropdown>
      </SheetPopover>
    </TouchSurface>
  );
  const baseline = (
    <>
      <div className={styles.baselineTablet}>
        <Group justify="space-between" className={styles.deviceHeader}>
          <Text fw={700}>Turn 2 · Bidding</Text>
          <Group gap="md">
            <RotateCcw size={19} aria-label="Take back" />
            <VolumeX size={19} />
            <Text size="xs">Direct over the Wi-Fi</Text>
          </Group>
        </Group>
        {circle(true)}
        <Text ta="center" size="xl" fw={700}>
          Spacing Guild to bid
        </Text>
        <Text ta="center">Fremen has 2 · 15 s</Text>
        <Text ta="center" size="sm" c="dimmed">
          Harkonnen pays 3 spice and takes the card. Harkonnen also draws a free card.
        </Text>
      </div>
      <div className={styles.phone}>
        <Group className={styles.deviceHeader} gap="sm">
          <FactionTokenFace token={factions[3]} size={36} aria-hidden />
          <Stack gap="xs">
            <Text fw={700}>Spacing Guild</Text>
            <Text size="xs">Linked to the tablet</Text>
          </Stack>
        </Group>
        <Stack gap="md">
          <Text size="xl" fw={700}>
            Your bid · 15
          </Text>
          <Text c="dimmed">Beat 2</Text>
          <Stepper label="Original remote bid" value={3} min={3} onChange={() => {}} />
          <Group grow>
            <LabeledAction icon={<ArrowRight size={15} />} intent="positive" emphasis="strong">
              Bid 3
            </LabeledAction>
            <LabeledAction icon={<ArrowRight size={15} />}>Pass</LabeledAction>
          </Group>
          <Text size="xs" c="dimmed">
            Direct over the Wi-Fi
          </Text>
        </Stack>
      </div>
    </>
  );
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header>
        <PageTitle title="Bidding flow review" />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <div className={styles.review} data-focus={String(search.focus) === '1' || undefined}>
          <header className={styles.reviewHeader}>
            <div>
              <Text size="xs" c="dimmed">
                Throwaway flow review · simulated devices and audio
              </Text>
              <Text size="xl" fw={700}>
                {before ? 'Recorded prototype H' : 'Agreed changes'}
              </Text>
            </div>
            <Group gap="xs">
              <LabeledAction
                icon={<ArrowRight size={15} />}
                size="sm"
                pressed={before}
                onClick={() => setSearch({ variant: 'before', step: 'bid' })}
              >
                Before
              </LabeledAction>
              <LabeledAction
                icon={<ArrowRight size={15} />}
                size="sm"
                pressed={!before}
                onClick={() => setSearch({ variant: 'after' })}
              >
                Agreed changes
              </LabeledAction>
              <Select
                aria-label="Preview device"
                value={view}
                data={[
                  { value: 'both', label: 'Tablet + remote' },
                  { value: 'tablet', label: 'Tablet only' },
                  { value: 'phone', label: 'Phone only' },
                ]}
                onChange={(value) => value && setSearch({ view: value })}
              />
            </Group>
          </header>
          {!before && (
            <nav className={styles.steps} aria-label="Review scenarios">
              {steps.map(([key, label]) => (
                <LabeledAction
                  icon={<ArrowRight size={15} />}
                  key={key}
                  size="compact-sm"
                  pressed={step === key}

                  onClick={() => setSearch({ step: key })}
                >
                  {label}
                </LabeledAction>
              ))}
            </nav>
          )}
          <Text size="sm" c="dimmed" className={styles.reviewNote}>
            {before
              ? 'Baseline view reproduces the recorded H controls and fixture data. The hand controls, manual card starts and recovery screens are agreed additions.'
              : descriptions[step]}
          </Text>
          <div className={styles.devices} data-view={view} data-before={before || undefined}>
            {before ? (
              baseline
            ) : (
              <>
                {view !== 'phone' && (
                  <Surface as="section" aria-label="Central tablet" className={styles.tabletFrame}>
                    {state.target === 'phone' ? (
                      <div className={styles.oldTablet}>
                        <WifiOff size={32} />
                        <Section title="Original tablet unavailable">
                          <Text>Table DUNE42 is unavailable on this device.</Text>
                        </Section>
                      </div>
                    ) : (
                      tablet
                    )}
                  </Surface>
                )}
                {view !== 'tablet' && (
                  <Surface as="section" aria-label="Player phone" className={styles.phoneFrame}>
                    {state.target === 'phone' && !state.recovery ? (
                      <div className={styles.phoneCentral}>{tablet}</div>
                    ) : (
                      remote
                    )}
                  </Surface>
                )}
              </>
            )}
          </div>
          {!before && panel}
          {!before && (
            <details className={styles.simulator}>
              <summary>Review controls · simulate events</summary>
              <Group gap="sm">
                <LabeledAction
                  icon={<ArrowRight size={15} />}
                  size="xs"
                  onClick={() => dispatch({ type: 'scenario', step })}
                >
                  Reset this example
                </LabeledAction>
                <LabeledAction
                  icon={<ArrowRight size={15} />}
                  size="xs"
                  onClick={() => dispatch({ type: 'no-phones' })}
                >
                  No phones at the table
                </LabeledAction>
                <LabeledAction
                  icon={<ArrowRight size={15} />}
                  size="xs"
                  disabledReason={
                    state.stage !== 'active' || !state.listen ? 'Start an auction and turn listening on.' : undefined
                  }
                  onClick={() => bidAction('Voice', 'bid', (state.high?.amount ?? 0) + 1)}
                >
                  Hear “bid plus one”
                </LabeledAction>
                <LabeledAction
                  icon={<ArrowRight size={15} />}
                  size="xs"
                  disabledReason={
                    state.stage !== 'active' || !state.listen ? 'Start an auction and turn listening on.' : undefined
                  }
                  onClick={() => bidAction('Voice', 'pass')}
                >
                  Hear “pass”
                </LabeledAction>
                <LabeledAction
                  icon={<ArrowRight size={15} />}
                  size="xs"
                  disabledReason={
                    state.stage !== 'active' || !state.listen ? 'Start an auction and turn listening on.' : undefined
                  }
                  onClick={() => {
                    bidAction('Phone', 'bid', state.phoneAmount);
                    bidAction('Voice', 'pass');
                  }}
                >
                  Phone bid, then late voice
                </LabeledAction>
                <LabeledAction
                  icon={<ArrowRight size={15} />}
                  size="xs"
                  disabledReason={state.stage !== 'active' ? 'Start an auction first.' : undefined}
                  onClick={() => dispatch({ type: 'timeout' })}
                >
                  Timer expires
                </LabeledAction>
                <LabeledAction
                  icon={<ArrowRight size={15} />}
                  size="xs"
                  disabledReason={state.stage !== 'active' ? 'Start an auction first.' : undefined}
                  onClick={() => dispatch({ type: 'win' })}
                >
                  Finish this card
                </LabeledAction>
                {state.newHost && (
                  <LabeledAction icon={<ArrowRight size={15} />} size="xs" onClick={() => dispatch({ type: 'rejoin' })}>
                    A phone rejoins
                  </LabeledAction>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                Connections, audio and recovery storage are simulated. The timer is held still for review.
              </Text>
              <pre>
                {JSON.stringify(
                  {
                    stage: state.stage,
                    table: state.code,
                    bidder: state.turn,
                    opener: state.opener,
                    starter: state.starter,
                    card: state.card,
                    target: state.cards,
                    wins: state.results,
                    hands: state.seats.map(({ id, hand, limit, full, pass }) => ({ id, hand, limit, full, pass })),
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          )}
          <div className={styles.reviewFooter}>
            <IconAction
              label="Previous scenario"
              emphasis="quiet"
              icon={<ArrowLeft size={16} />}
              onClick={() => cycle(-1)}
            />
            <Text size="sm">{before ? 'Before · prototype H' : steps.find(([key]) => key === step)?.[1]}</Text>
            <IconAction
              label="Next scenario"
              emphasis="quiet"
              icon={<ArrowRight size={16} />}
              onClick={() => cycle(1)}
            />
          </div>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

/* The battle wheel's thumb-sized minus/value/plus row, with a typed value for corrections. */
function CountControl({
  label,
  title,
  value,
  min = 0,
  onChange,
}: Readonly<{ label: string; title: string; value: number; min?: number; onChange: (value: number) => void }>) {
  return (
    <div className={styles.countControl} role="group" aria-label={label}>
      <Text className={styles.grow} size="sm">
        {title}
      </Text>
      <IconAction
        label={`Fewer: ${label}`}
        size="xl"
        emphasis="standard"
        icon={<Minus size={21} />}
        disabledReason={value <= min ? `Minimum ${min}.` : undefined}
        onClick={() => onChange(Math.max(min, value - 1))}
      />
      <NumberInput
        aria-label={label}
        size="md"
        className={styles.countInput}
        value={value}
        min={min}
        hideControls
        allowDecimal={false}
        allowNegative={false}
        onChange={(next) => {
          if (typeof next === 'number' && Number.isSafeInteger(next) && next >= min) {
            onChange(next);
          }
        }}
      />
      <IconAction
        label={`More: ${label}`}
        size="xl"
        emphasis="standard"
        icon={<Plus size={21} />}
        onClick={() => onChange(value + 1)}
      />
    </div>
  );
}

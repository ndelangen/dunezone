/* oxlint-disable-next-line no-restricted-imports -- This throwaway comparison retains the prototype button vocabulary under the app theme; production actions will use the kit. */
import { Button, Group, Stack, Switch, Text, Select, NumberInput, UnstyledButton } from '@mantine/core';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { EmptyNote } from '@ui/content/EmptyNote';
import { ControlBlock } from '@ui/control/ControlBlock';
import { Stepper } from '@ui/control/Stepper';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface/Surface';
import {
  ArrowLeft,
  ArrowRight,
  Gavel,
  Hand,
  Mic,
  MicOff,
  QrCode,
  RotateCcw,
  Volume2,
  VolumeX,
  Wifi,
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
  handOpen: boolean;
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
    handOpen: step === 'hands' || step === 'restore',
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
        | 'handOpen'
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
  | { type: 'reorder'; id: string; delta: number }
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
  if (event.type === 'reorder') {
    const seats = [...state.seats];
    const i = seats.findIndex((s) => s.id === event.id);
    const j = (i + event.delta + seats.length) % seats.length;
    [seats[i], seats[j]] = [seats[j], seats[i]];
    return { ...state, seats };
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
      <Stack gap="sm">
        <Group justify="space-between">
          <Text>Cards in hand</Text>
          <Stepper
            label={`${seat.name} hand count`}
            value={seat.hand}
            min={0}
            onChange={(value) => dispatch({ type: 'edit', id: seat.id, field: 'hand', value })}
            size="sm"
          />
        </Group>
        <Group justify="space-between">
          <Text>Hand limit</Text>
          <Stepper
            label={`${seat.name} hand limit`}
            value={seat.limit}
            min={0}
            onChange={(value) => dispatch({ type: 'edit', id: seat.id, field: 'limit', value })}
            size="sm"
          />
        </Group>
        <Switch
          label="Full"
          aria-label={`${seat.name} Full`}
          checked={seat.full}
          onChange={(e) => dispatch({ type: 'edit', id: seat.id, field: 'full', value: e.currentTarget.checked })}
        />
        <Switch
          label="Always pass"
          aria-label={`${seat.name} Always pass`}
          checked={seat.pass}
          onChange={(e) => dispatch({ type: 'edit', id: seat.id, field: 'pass', value: e.currentTarget.checked })}
        />
        <Text size="xs" c="dimmed">
          Always pass stays on until you switch it off. Count or limit edits recalculate Full.
        </Text>
      </Stack>
    );
  };
  const pad = (source: string, id = state.turn) => (
    <Stack gap="sm">
      <Stepper
        label={`${source} bid amount`}
        value={source === 'Phone' ? state.phoneAmount : state.amount}
        min={(state.high?.amount ?? 0) + 1}
        onChange={(value) => dispatch({ type: 'field', field: source === 'Phone' ? 'phoneAmount' : 'amount', value })}
      />
      <Group grow>
        <Button
          color="brand"
          leftSection={<Gavel size={17} />}
          onClick={() => bidAction(source, 'bid', source === 'Phone' ? state.phoneAmount : state.amount, id)}
        >
          Bid {source === 'Phone' ? state.phoneAmount : state.amount}
        </Button>
        <Button
          color="neutral"
          leftSection={<Hand size={17} />}
          onClick={() => bidAction(source, 'pass', source === 'Phone' ? state.phoneAmount : state.amount, id)}
        >
          Pass
        </Button>
      </Group>
      <Button
        variant="subtle"
        color="neutral"
        onClick={() => bidAction(source, 'bid', (state.high?.amount ?? 0) + 1, id)}
      >
        One more
      </Button>
    </Stack>
  );
  const starterControl = (
    <Stack gap="sm">
      <ControlBlock
        title="Start new bid at"
        input={
          <Select
            aria-label="Start new bid at"
            value={state.starter}
            data={state.seats.map((s) => ({ value: s.id, label: `${s.name}${s.full ? ' · Full' : ''}` }))}
            onChange={(value) => value && dispatch({ type: 'field', field: 'starter', value })}
          />
        }
      />
      <Button color="brand" leftSection={<Gavel size={17} />} onClick={() => dispatch({ type: 'start' })}>
        Start new bid
      </Button>
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
    return (
      <div className={styles.arena} aria-label="Fixed seating circle">
        {game.stage !== 'over' && (
          <svg className={styles.arrow} viewBox="0 0 100 100" aria-hidden>
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="19"
              transform={`rotate(${(game.seats.findIndex((s) => s.id === (game.stage === 'ready' || game.stage === 'setup' ? game.starter : game.turn)) * 360) / game.seats.length} 50 50)`}
            />
            <path
              d="M46 24 L50 17 L54 24"
              transform={`rotate(${(game.seats.findIndex((s) => s.id === (game.stage === 'ready' || game.stage === 'setup' ? game.starter : game.turn)) * 360) / game.seats.length} 50 50)`}
            />
          </svg>
        )}
        <div className={styles.cardMiddle}>
          {game.stage !== 'over' && (
            <img src="/play-fixtures/dreamrules/cardback.jpg" alt="Physical Treachery card, shown face down" />
          )}
          <Text size="xs">{game.stage === 'over' ? 'No card up' : `Card ${game.card} of ${game.cards}`}</Text>
        </div>
        {game.seats.map((s, i) => {
          const active =
            game.stage !== 'over' &&
            s.id === (game.stage === 'ready' || game.stage === 'setup' ? game.starter : game.turn);
          const angle = (i * Math.PI * 2) / game.seats.length - Math.PI / 2;
          return (
            <UnstyledButton
              key={s.id}
              disabled={baseline}
              className={styles.seat}
              data-active={active || undefined}
              style={{ left: `${50 + Math.cos(angle) * 38}%`, top: `${50 + Math.sin(angle) * 38}%` } as CSSProperties}
              aria-label={`${s.name}, ${s.hand} cards${s.full ? ', Full' : ''}`}
              onClick={() =>
                game.stage === 'setup' || game.stage === 'ready'
                  ? dispatch({ type: 'field', field: 'starter', value: s.id })
                  : (() => {
                      dispatch({ type: 'field', field: 'selected', value: s.id });
                      dispatch({ type: 'field', field: 'handOpen', value: true });
                    })()
              }
            >
              <FactionTokenFace token={s} size={active ? 60 : 48} aria-hidden />
              <Text size="sm" fw={700}>
                {s.name}
              </Text>
              <Text size="sm">
                {baseline
                  ? s.full
                    ? 'Full'
                    : `${s.id === 'house-harkonnen' ? 4 : s.hand}/${s.id === 'house-harkonnen' ? 8 : 4}`
                  : `${s.hand} / ${s.limit}`}
              </Text>
              {!baseline && (
                <Text size="xs" c={s.full || s.pass ? 'yellow' : 'dimmed'}>
                  {s.full ? 'Full' : s.pass ? 'Always pass' : s.linked ? 'Phone linked' : 'At the table'}
                </Text>
              )}
            </UnstyledButton>
          );
        })}
      </div>
    );
  }
  const header = (
    <Group justify="space-between" className={styles.deviceHeader}>
      <Stack gap="xs">
        <Text size="sm" fw={700}>
          Turn {state.phase} · Bidding
        </Text>
        <Text size="xs" c="dimmed">
          {state.stage === 'over' ? 'Phase complete' : `Card ${state.card} of ${state.cards}`} · {state.ruleset}
        </Text>
      </Stack>
      <Group gap="xs">
        <Button
          size="compact-sm"
          variant="subtle"
          color="neutral"
          aria-label="Toggle listening"
          onClick={() => dispatch({ type: 'field', field: 'listen', value: !state.listen })}
        >
          {state.listen ? <Mic size={19} /> : <MicOff size={19} />}
        </Button>
        <Button
          size="compact-sm"
          variant="subtle"
          color="neutral"
          aria-label="Toggle announcements"
          onClick={() => dispatch({ type: 'field', field: 'speaking', value: !state.speaking })}
        >
          {state.speaking ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </Button>
        <Text size="xs" c="dimmed">
          {state.code}
        </Text>
      </Group>
    </Group>
  );
  const tablet = (
    <div className={styles.tablet} data-testid="tablet-screen">
      {header}
      <div className={styles.tabletBody}>
        <div className={styles.circleColumn}>
          {circle()}
          {state.stage === 'setup' && <div className={styles.joinInfo}>{qr}</div>}
          <Group justify="center" gap="md">
            <Text size="xs" c="dimmed">
              {state.listen ? 'Listening' : 'Listening off'}
            </Text>
            <Text size="xs" c="dimmed">
              {state.speaking ? 'Announcements on' : 'Announcements off'}
            </Text>
          </Group>
        </div>
        <div className={styles.controlColumn}>
          {state.stage === 'setup' ? (
            <Stack gap="md">
              <Section title="Set up the table">
                <Text size="sm">Arrange factions to match the seats. Tap the circle to choose the first bidder.</Text>
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
              <div className={styles.seatList}>
                {state.seats.map((s) => (
                  <Group key={s.id} justify="space-between" gap="xs">
                    <Text size="sm">{s.name}</Text>
                    <Group gap="xs">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        aria-label={`Move ${s.name} earlier`}
                        onClick={() => dispatch({ type: 'reorder', id: s.id, delta: -1 })}
                      >
                        ↑
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        aria-label={`Move ${s.name} later`}
                        onClick={() => dispatch({ type: 'reorder', id: s.id, delta: 1 })}
                      >
                        ↓
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="neutral"
                        disabled={state.seats.length <= 2}
                        aria-label={`Remove ${s.name}`}
                        onClick={() => dispatch({ type: 'remove', id: s.id })}
                      >
                        ×
                      </Button>
                    </Group>
                  </Group>
                ))}
              </div>
              <ControlBlock
                title="Add a faction"
                input={
                  <Select
                    placeholder="Choose a faction"
                    aria-label="Add a faction"
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
                      onChange={(v) => dispatch({ type: 'field', field: 'seconds', value: Number(v) })}
                    />
                  }
                />
              </Group>
              <Text size="sm" c="dimmed">
                Suggested: {state.seats.filter((s) => !s.full).length} cards, one per non-full faction.
              </Text>
              {starterControl}
            </Stack>
          ) : state.stage === 'ready' ? (
            <Stack gap="lg">
              <Section title="Start new bid">
                <Text>{state.note}</Text>
              </Section>
              {starterControl}
              <Section title="Completed wins">{results}</Section>
            </Stack>
          ) : state.stage === 'over' ? (
            <Stack gap="lg">
              <Section title="Bidding is over">
                <Text>{state.note}</Text>
              </Section>
              {results}
              <Button color="brand" onClick={() => dispatch({ type: 'next-phase' })}>
                Set up turn {state.phase + 1}
              </Button>
            </Stack>
          ) : (
            <Stack gap="md">
              <Section
                title={state.stage === 'paused' ? 'Check before resuming' : `${nameOf(state, state.turn)} to bid`}
              >
                <Text size="xl" fw={700}>
                  {state.high ? `${nameOf(state, state.high.id)} has ${state.high.amount}` : 'Open the bidding'}
                </Text>
                <Text size="sm" c="dimmed">
                  {state.stage === 'paused'
                    ? `Paused · ${state.seconds ? `fresh ${state.seconds}s timer on Resume` : 'timer off'}`
                    : state.seconds
                      ? `${state.left} seconds`
                      : 'Timer off'}
                </Text>
              </Section>
              {state.stage === 'paused' ? (
                <>
                  <Text size="sm">{state.note}</Text>
                  <Button color="brand" onClick={() => dispatch({ type: 'resume' })}>
                    Resume
                  </Button>
                  {state.newHost && qr}
                  <Section title="Completed wins">{results}</Section>
                </>
              ) : (
                pad('Tablet')
              )}
              <Button
                variant="subtle"
                color="neutral"
                leftSection={<RotateCcw size={15} />}
                onClick={() => dispatch({ type: 'reset' })}
              >
                Reset this card
              </Button>
              <details
                className={styles.details}
                open={state.handOpen}
                onToggle={(e) => {
                  if (e.currentTarget.open !== state.handOpen) {
                    dispatch({ type: 'field', field: 'handOpen', value: e.currentTarget.open });
                  }
                }}
              >
                <summary>Hand controls · {nameOf(state, state.selected)}</summary>
                <Stack gap="sm">
                  <Select
                    aria-label="Faction to edit"
                    value={state.selected}
                    data={state.seats.map((s) => ({ value: s.id, label: s.name }))}
                    onChange={(value) => value && dispatch({ type: 'field', field: 'selected', value })}
                  />
                  {handControls(state.selected)}
                </Stack>
              </details>
              <div className={styles.eventLog} aria-live="polite">
                {state.log.slice(0, 3).map((line, i) => (
                  <Text key={i} size="xs" c="dimmed">
                    {line}
                  </Text>
                ))}
              </div>
            </Stack>
          )}
          {['setup', 'ready', 'over'].includes(state.stage) && (
            <details
              className={styles.details}
              open={state.handOpen}
              onToggle={(e) => {
                if (e.currentTarget.open !== state.handOpen) {
                  dispatch({ type: 'field', field: 'handOpen', value: e.currentTarget.open });
                }
              }}
            >
              <summary>Hand controls · {nameOf(state, state.selected)}</summary>
              <Stack gap="sm">
                <Select
                  aria-label="Faction to edit"
                  value={state.selected}
                  data={state.seats.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={(value) => value && dispatch({ type: 'field', field: 'selected', value })}
                />
                {handControls(state.selected)}
              </Stack>
            </details>
          )}
        </div>
      </div>
    </div>
  );
  const remoteSeat = state.seats.find((s) => s.id === state.remote);
  const remote = (
    <div className={styles.phone} data-testid="phone-screen">
      <Group justify="space-between" className={styles.deviceHeader}>
        <Text fw={700}>{state.newHost ? 'Central device' : (remoteSeat?.name ?? 'Join the table')}</Text>
        <Text size="xs" c="dimmed">
          {state.code}
        </Text>
      </Group>
      {state.recovery ? (
        <Stack gap="md">
          <Section title={state.newHost ? 'Check the recovered table' : 'Tablet unavailable'}>
            <Text size="sm">
              {state.newHost ? 'This phone is now the central device.' : 'A saved copy is available on this phone.'}
            </Text>
          </Section>
          <Text size="sm">Copy received at {state.received}</Text>
          <Text size="sm">
            Turn {state.phase} · {state.ruleset}
          </Text>
          <Text size="sm">
            {state.seconds ? `${state.seconds}s per bidder. Resume gives a fresh full timer.` : 'Timer off.'}
          </Text>
          <Text size="xs" c="dimmed">
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
              <Text size="xs" c="dimmed">
                {state.seats.filter((s) => s.linked).length} phones rejoined
              </Text>
              <details className={styles.details}>
                <summary>Check or correct a hand</summary>
                <Select
                  aria-label="Recovered faction to edit"
                  value={state.selected}
                  data={state.seats.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={(value) => value && dispatch({ type: 'field', field: 'selected', value })}
                />
                {handControls(state.selected)}
              </details>
              <Button color="neutral" variant="subtle" onClick={() => dispatch({ type: 'reset' })}>
                Reset this card
              </Button>
              <Button color="brand" onClick={() => dispatch({ type: 'resume' })}>
                Resume
              </Button>
            </>
          ) : (
            <Button color="brand" onClick={() => dispatch({ type: 'promote' })}>
              Use this phone as central
            </Button>
          )}
        </Stack>
      ) : !remoteSeat ? (
        <Stack gap="md">
          <Section title="Choose your faction">
            <Text size="sm">Table {state.code}</Text>
          </Section>
          {state.seats.map((s) => (
            <Button
              key={s.id}
              color="neutral"
              variant="light"
              justify="start"
              leftSection={<FactionTokenFace token={s} size={26} aria-hidden />}
              onClick={() => dispatch({ type: 'field', field: 'remote', value: s.id })}
            >
              {s.name}
              {s.linked ? ' · phone linked' : ''}
            </Button>
          ))}
        </Stack>
      ) : (
        <Stack gap="md">
          <Group gap="xs">
            <Wifi size={14} />
            <Text size="xs" c="dimmed">
              Linked to the tablet
            </Text>
          </Group>
          {state.stage === 'active' && state.remote === state.turn ? (
            <>
              <Section title="Your bid">
                <Text size="sm">
                  {state.high ? `Beat ${state.high.amount}` : 'Open the bidding'}
                  {state.seconds ? ` · ${state.left}s` : ''}
                </Text>
              </Section>
              {pad('Phone', remoteSeat.id)}
            </>
          ) : state.stage === 'ready' ? (
            <>
              <Section title="Start new bid">
                <Text size="sm">{state.note}</Text>
              </Section>
              {starterControl}
            </>
          ) : (
            <Section
              title={
                state.stage === 'paused'
                  ? 'Table paused'
                  : state.stage === 'setup'
                    ? 'Waiting for the table'
                    : state.stage === 'over'
                      ? 'Bidding is over'
                      : `${nameOf(state, state.turn)} is bidding`
              }
            >
              <Text size="sm" c="dimmed">
                {state.stage === 'paused'
                  ? 'Check the central display, then Resume.'
                  : state.high
                    ? `Bid to beat: ${state.high.amount}`
                    : 'Your hand controls are available.'}
              </Text>
            </Section>
          )}
          <div className={styles.handSection}>
            <Section title="Your hand">{handControls(remoteSeat.id)}</Section>
          </div>
          <Group justify="space-between">
            <Button
              size="xs"
              variant="subtle"
              color="neutral"
              disabled={state.stage !== 'active' && state.stage !== 'paused'}
              onClick={() => dispatch({ type: 'reset' })}
            >
              Reset this card
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="neutral"
              onClick={() => dispatch({ type: 'field', field: 'remote', value: null })}
            >
              Change faction
            </Button>
          </Group>
        </Stack>
      )}
    </div>
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
            <Button color="brand">Bid 3</Button>
            <Button color="neutral">Pass</Button>
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
              <Button
                size="sm"
                color={before ? 'brand' : 'neutral'}
                onClick={() => setSearch({ variant: 'before', step: 'bid' })}
              >
                Before
              </Button>
              <Button size="sm" color={!before ? 'brand' : 'neutral'} onClick={() => setSearch({ variant: 'after' })}>
                Agreed changes
              </Button>
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
                <Button
                  key={key}
                  size="compact-sm"
                  variant={step === key ? 'filled' : 'subtle'}
                  color={step === key ? 'brand' : 'neutral'}
                  onClick={() => setSearch({ step: key })}
                >
                  {label}
                </Button>
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
          {!before && (
            <details className={styles.simulator}>
              <summary>Review controls · simulate events</summary>
              <Group gap="sm">
                <Button size="xs" color="neutral" onClick={() => dispatch({ type: 'scenario', step })}>
                  Reset this example
                </Button>
                <Button size="xs" onClick={() => dispatch({ type: 'no-phones' })}>
                  No phones at the table
                </Button>
                <Button
                  size="xs"
                  disabled={state.stage !== 'active' || !state.listen}
                  onClick={() => bidAction('Voice', 'bid', (state.high?.amount ?? 0) + 1)}
                >
                  Hear “bid plus one”
                </Button>
                <Button
                  size="xs"
                  disabled={state.stage !== 'active' || !state.listen}
                  onClick={() => bidAction('Voice', 'pass')}
                >
                  Hear “pass”
                </Button>
                <Button
                  size="xs"
                  disabled={state.stage !== 'active' || !state.listen}
                  onClick={() => {
                    bidAction('Phone', 'bid', state.phoneAmount);
                    bidAction('Voice', 'pass');
                  }}
                >
                  Phone bid, then late voice
                </Button>
                <Button size="xs" disabled={state.stage !== 'active'} onClick={() => dispatch({ type: 'timeout' })}>
                  Timer expires
                </Button>
                <Button size="xs" disabled={state.stage !== 'active'} onClick={() => dispatch({ type: 'win' })}>
                  Finish this card
                </Button>
                {state.newHost && (
                  <Button size="xs" onClick={() => dispatch({ type: 'rejoin' })}>
                    A phone rejoins
                  </Button>
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
            <Button size="compact-sm" variant="subtle" aria-label="Previous scenario" onClick={() => cycle(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <Text size="sm">{before ? 'Before · prototype H' : steps.find(([key]) => key === step)?.[1]}</Text>
            <Button size="compact-sm" variant="subtle" aria-label="Next scenario" onClick={() => cycle(1)}>
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

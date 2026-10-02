import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { phaseAt } from '@shared/play/phases';
import { PageTitle } from '@ui/block/PageTitle';
import { Eyebrow } from '@ui/content/Eyebrow';
import { nameDiscColor } from '@ui/content/nameDisc';
import { StatusBadge } from '@ui/content/StatusBadge';
import { CallToAction } from '@ui/control/CallToAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { ArrowRight, Clock, Crown, Eye, Plus, Trophy, Users, X } from 'lucide-react';
import { useReducer, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';

import styles from './GalleryLobby.module.css';
import {
  ageWords,
  joinable,
  LAST_TURN,
  NOW,
  openSeats,
  PHASES_PER_TURN,
  resultWords,
  RULESETS,
  STAGE_WORDS,
  turnOf,
  VIEWER,
} from './lobbyDesigns.fixture';
import type { DesignEntry } from './lobbyDesigns.fixture';

/*
 * Direction C, the gallery: the lobby as a room of game tables.
 * Every game is a card with its seats drawn round a ring, so a glance tells who sits where, which seats are free and how far the game has come.
 * Everything runs on local state: taking a seat, creating a game and opening a table change only this page.
 */

type Tab = 'open' | 'yours' | 'finished';
type Player = DesignEntry['players'][number];
type Seat = { index: number; player: Player | null; isViewer: boolean };
type Note = { gameId: string; words: string };

type LobbyState = {
  entries: DesignEntry[];
  /* The seat the viewer picked in a game they joined here, so the disc they clicked is the one that fills. */
  chosenSeats: Record<string, number>;
  tab: Tab;
  pendingSeat: { gameId: string; index: number } | null;
  note: Note | null;
  fresh: string | null;
};

type LobbyEvent =
  | { type: 'tabChosen'; tab: Tab }
  | { type: 'seatOffered'; gameId: string; index: number }
  | { type: 'seatDeclined' }
  | { type: 'seatTaken'; gameId: string; index: number }
  | { type: 'tableOpened'; gameId: string; words: string }
  | { type: 'noteDismissed' }
  | { type: 'gameCreated'; entry: DesignEntry };

function lobbyReducer(state: LobbyState, event: LobbyEvent): LobbyState {
  switch (event.type) {
    case 'tabChosen':
      return { ...state, tab: event.tab, pendingSeat: null };
    case 'seatOffered':
      return { ...state, pendingSeat: { gameId: event.gameId, index: event.index } };
    case 'seatDeclined':
      return { ...state, pendingSeat: null };
    case 'seatTaken':
      return {
        ...state,
        pendingSeat: null,
        chosenSeats: { ...state.chosenSeats, [event.gameId]: event.index },
        note: {
          gameId: event.gameId,
          words: `You sit in seat ${event.index + 1}. The game moves on once every seat is filled.`,
        },
        entries: state.entries.map((entry) =>
          entry.gameId === event.gameId
            ? {
                ...entry,
                viewerSeated: true,
                seatsFilled: entry.seatsFilled + 1,
                players: [...entry.players, { displayName: VIEWER, faction: null }],
                lastActivityAt: NOW,
              }
            : entry
        ),
      };
    case 'tableOpened':
      return { ...state, note: { gameId: event.gameId, words: event.words } };
    case 'noteDismissed':
      return { ...state, note: null };
    case 'gameCreated':
      return {
        ...state,
        entries: [event.entry, ...state.entries],
        tab: state.tab === 'finished' ? 'open' : state.tab,
        fresh: event.entry.gameId,
        note: {
          gameId: event.entry.gameId,
          words: 'Your table is set. Share the link and seats fill as players arrive.',
        },
      };
  }
}

const isFinished = (entry: DesignEntry) => entry.stage === 'finished';
const isOngoing = (entry: DesignEntry) => entry.stage !== 'finished' && entry.stage !== 'discarded';
const byRecency = (a: DesignEntry, b: DesignEntry) => b.lastActivityAt - a.lastActivityAt;

/* Your games first, then the ones you could join, then the ones to watch; the most recent first within each. */
const openRank = (entry: DesignEntry) => (entry.viewerSeated ? 0 : joinable(entry) ? 1 : 2);

function gamesFor(tab: Tab, entries: DesignEntry[]): DesignEntry[] {
  switch (tab) {
    case 'open':
      return entries.filter(isOngoing).sort((a, b) => openRank(a) - openRank(b) || byRecency(a, b));
    case 'yours':
      return entries.filter((entry) => isOngoing(entry) && entry.viewerSeated).sort(byRecency);
    case 'finished':
      return entries.filter(isFinished).sort(byRecency);
  }
}

/* Players fill the seats in the order they arrived, leaving the seat the viewer picked here for the viewer. */
function seatsOf(entry: DesignEntry, chosen: number | undefined): Seat[] {
  const seats: Seat[] = Array.from({ length: entry.seatCount }, (_, index) => ({
    index,
    player: null,
    isViewer: false,
  }));
  const others = chosen === undefined ? entry.players : entry.players.filter((player) => player.displayName !== VIEWER);
  if (chosen !== undefined) {
    seats[chosen] = { index: chosen, player: { displayName: VIEWER, faction: null }, isViewer: true };
  }
  let next = 0;
  for (const player of others) {
    while (seats[next]?.player) {
      next += 1;
    }
    if (next >= seats.length) {
      break;
    }
    seats[next] = { index: next, player, isViewer: player.displayName === VIEWER };
  }
  return seats;
}

const initialOf = (name: string) => name.trim().charAt(0).toUpperCase();

/*
 * Ring geometry, in the 100-unit box the table is drawn in.
 * Seats sit on the outer circle; a disc grows to the gap between neighbours and never past a comfortable size.
 */
const SEAT_RADIUS = 42;
const TABLE_RADIUS = 28;
const ARC_RADIUS = 32;
const ARC_LENGTH = 2 * Math.PI * ARC_RADIUS;

function seatPlacement(index: number, count: number, size: number): CSSProperties {
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  return {
    '--seat-x': `${50 + SEAT_RADIUS * Math.cos(angle)}%`,
    '--seat-y': `${50 + SEAT_RADIUS * Math.sin(angle)}%`,
    '--seat-size': `${size}cqi`,
  } as CSSProperties;
}

const seatSize = (count: number) => Math.min(16, 0.84 * 2 * SEAT_RADIUS * Math.sin(Math.PI / count));

/* Ten ticks round the table, one per turn, and a thin arc for how much of the game has been played. */
function TurnArc({ progress }: Readonly<{ progress: number | null }>) {
  return (
    <svg className={styles.tableArt} viewBox="0 0 100 100" aria-hidden>
      <circle className={styles.tableTop} cx="50" cy="50" r={TABLE_RADIUS} />
      <circle className={styles.tableInlay} cx="50" cy="50" r={TABLE_RADIUS - 3.5} />
      {progress === null ? null : (
        <>
          {Array.from({ length: LAST_TURN }, (_, turn) => {
            const angle = (turn / LAST_TURN) * 2 * Math.PI - Math.PI / 2;
            return (
              <line
                key={turn}
                className={styles.tick}
                x1={50 + (ARC_RADIUS - 1.4) * Math.cos(angle)}
                y1={50 + (ARC_RADIUS - 1.4) * Math.sin(angle)}
                x2={50 + (ARC_RADIUS + 1.4) * Math.cos(angle)}
                y2={50 + (ARC_RADIUS + 1.4) * Math.sin(angle)}
              />
            );
          })}
          <circle className={styles.arcTrack} cx="50" cy="50" r={ARC_RADIUS} />
          <circle
            className={styles.arc}
            cx="50"
            cy="50"
            r={ARC_RADIUS}
            strokeDasharray={`${ARC_LENGTH * progress} ${ARC_LENGTH}`}
            transform="rotate(-90 50 50)"
          />
        </>
      )}
    </svg>
  );
}

function seatLabel(seat: Seat, winners: readonly string[]): string {
  if (!seat.player) {
    return `Seat ${seat.index + 1}, open`;
  }
  const who = seat.isViewer ? `You (${seat.player.displayName})` : seat.player.displayName;
  const faction = seat.player.faction ?? 'no faction yet';
  const won = seat.player.faction && winners.includes(seat.player.faction) ? ', a winner' : '';
  return `${who}, ${faction}${won}`;
}

type RingProps = {
  seats: Seat[];
  centre: ReactNode;
  progress: number | null;
  winners?: readonly string[];
  /* Present only where an open seat can be taken: the open discs become buttons that ask before seating you. */
  joining?: {
    gameName: string;
    pending: number | null;
    onOffer: (index: number) => void;
    onDecline: () => void;
    onTake: (index: number) => void;
  };
  size?: 'card' | 'small';
  label: string;
};

function TableRing({ seats, centre, progress, winners = [], joining, size = 'card', label }: Readonly<RingProps>) {
  const disc = seatSize(seats.length);
  return (
    <div className={clsx(styles.ring, size === 'small' && styles.ringSmall)} role="group" aria-label={label}>
      <TurnArc progress={progress} />
      <div className={styles.centre}>{centre}</div>
      {seats.map((seat) => {
        const placement = seatPlacement(seat.index, seats.length, disc);
        const words = seatLabel(seat, winners);
        const won = Boolean(seat.player?.faction && winners.includes(seat.player.faction));
        if (seat.player) {
          return (
            <Tooltip key={seat.index} label={words} withArrow>
              <span
                role="img"
                aria-label={words}
                className={clsx(styles.seat, styles.seatTaken, seat.isViewer && styles.seatViewer)}
                style={{ ...placement, '--seat-fill': nameDiscColor(seat.player.displayName) } as CSSProperties}
              >
                {initialOf(seat.player.displayName)}
                {won ? (
                  <span className={styles.crown}>
                    <Crown aria-hidden />
                  </span>
                ) : null}
              </span>
            </Tooltip>
          );
        }
        if (!joining) {
          return (
            <Tooltip key={seat.index} label="Open seat" withArrow>
              <span role="img" aria-label={words} className={clsx(styles.seat, styles.seatOpen)} style={placement} />
            </Tooltip>
          );
        }
        const opened = joining.pending === seat.index;
        return (
          <Popover
            key={seat.index}
            opened={opened}
            onDismiss={joining.onDecline}
            position="top"
            withArrow
            trapFocus
            returnFocus
          >
            <Popover.Target>
              <button
                type="button"
                aria-label={`Take seat ${seat.index + 1} at ${joining.gameName}`}
                aria-expanded={opened}
                className={clsx(styles.seat, styles.seatOpen, styles.seatJoinable, opened && styles.seatPending)}
                style={placement}
                onClick={() => (opened ? joining.onDecline() : joining.onOffer(seat.index))}
              >
                <Plus aria-hidden className={styles.seatPlus} />
              </button>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Take seat {seat.index + 1}?
                </Text>
                <Text size="xs" c="dimmed">
                  You join {joining.gameName} and draft with the others.
                </Text>
                <Group gap="xs" justify="flex-end">
                  <Button size="compact-sm" variant="subtle" color="gray" onClick={joining.onDecline}>
                    Cancel
                  </Button>
                  <Button size="compact-sm" color="confirm" onClick={() => joining.onTake(seat.index)}>
                    Join
                  </Button>
                </Group>
              </Stack>
            </Popover.Dropdown>
          </Popover>
        );
      })}
    </div>
  );
}

/* What sits in the middle of the table: the turn in play, the stage before play, a trophy once it is over. */
function RingCentre({ entry }: Readonly<{ entry: DesignEntry }>) {
  const turn = turnOf(entry);
  if (entry.stage === 'finished') {
    return (
      <>
        <Trophy aria-hidden className={styles.centreGlyph} />
        <span className={styles.centreSmall}>
          Turn {entry.phase === null ? LAST_TURN : Math.floor(entry.phase / PHASES_PER_TURN) + 1}
        </span>
      </>
    );
  }
  if (turn !== null) {
    return (
      <>
        <span className={styles.centreSmall}>Turn</span>
        <span className={styles.centreNumber}>{turn}</span>
        <span className={styles.centreSmall}>of {LAST_TURN}</span>
      </>
    );
  }
  return (
    <>
      <span className={styles.centreWord}>{STAGE_WORDS[entry.stage]}</span>
      <span className={styles.centreSmall}>
        {entry.seatsFilled} of {entry.seatCount}
      </span>
    </>
  );
}

const progressOf = (entry: DesignEntry) =>
  entry.stage === 'play' && entry.phase !== null
    ? Math.min(1, (entry.phase + 1) / (LAST_TURN * PHASES_PER_TURN))
    : null;

function stageLine(entry: DesignEntry): string {
  if (entry.stage === 'play' && entry.phase !== null) {
    return phaseAt(entry.phase).label;
  }
  if (entry.stage === 'finished') {
    return resultWords(entry.result) ?? 'Finished';
  }
  const open = openSeats(entry);
  return open > 0
    ? `${STAGE_WORDS[entry.stage]}, ${open} ${open === 1 ? 'seat' : 'seats'} open`
    : STAGE_WORDS[entry.stage];
}

type CardAction = { words: string; icon: ReactNode; tone: 'resume' | 'join' | 'watch' | 'result' };

function actionOf(entry: DesignEntry): CardAction {
  if (entry.stage === 'finished') {
    return { words: 'See result', icon: <Trophy size={15} aria-hidden />, tone: 'result' };
  }
  if (entry.viewerSeated) {
    return { words: 'Resume', icon: <ArrowRight size={15} aria-hidden />, tone: 'resume' };
  }
  if (joinable(entry)) {
    return { words: 'Join', icon: <Plus size={15} aria-hidden />, tone: 'join' };
  }
  return { words: 'Watch', icon: <Eye size={15} aria-hidden />, tone: 'watch' };
}

function cardBadge(entry: DesignEntry): ReactNode {
  if (entry.stage === 'finished') {
    return entry.viewerSeated ? <StatusBadge tone="brand">You played</StatusBadge> : null;
  }
  if (entry.viewerSeated) {
    return <StatusBadge tone="brand">Your seat</StatusBadge>;
  }
  if (joinable(entry)) {
    return <StatusBadge tone="positive">Seats open</StatusBadge>;
  }
  return <StatusBadge>Watch only</StatusBadge>;
}

function WinnerChips({ entry }: Readonly<{ entry: DesignEntry }>) {
  if (entry.result === null) {
    return null;
  }
  if (entry.result.kind === 'none') {
    return (
      <Group gap={4} className={styles.winners}>
        <Badge variant="default" radius="sm">
          No winner
        </Badge>
      </Group>
    );
  }
  return (
    <Group gap={4} className={styles.winners}>
      {entry.result.factions.map((faction) => (
        <Badge key={faction} radius="sm" className={styles.winnerChip} leftSection={<Crown size={11} aria-hidden />}>
          {faction}
        </Badge>
      ))}
    </Group>
  );
}

type GameCardProps = {
  entry: DesignEntry;
  chosenSeat: number | undefined;
  pendingSeat: number | null;
  note: string | null;
  fresh: boolean;
  dispatch: (event: LobbyEvent) => void;
  onShowResult: (entry: DesignEntry) => void;
};

function GameCard({ entry, chosenSeat, pendingSeat, note, fresh, dispatch, onShowResult }: Readonly<GameCardProps>) {
  const seats = seatsOf(entry, chosenSeat);
  const action = actionOf(entry);
  const canJoin = joinable(entry);
  const winners = entry.result?.factions ?? [];
  const firstOpen = seats.find((seat) => seat.player === null)?.index ?? null;

  const act = () => {
    switch (action.tone) {
      case 'result':
        onShowResult(entry);
        return;
      case 'join':
        if (firstOpen !== null) {
          dispatch({ type: 'seatOffered', gameId: entry.gameId, index: firstOpen });
        }
        return;
      case 'resume':
        dispatch({
          type: 'tableOpened',
          gameId: entry.gameId,
          words:
            entry.stage === 'play'
              ? 'Would take you back to your seat at the table.'
              : 'Would open the table at your seat.',
        });
        return;
      case 'watch':
        dispatch({
          type: 'tableOpened',
          gameId: entry.gameId,
          words: 'Would open the table to watch. You can see everything but move nothing.',
        });
        return;
    }
  };

  return (
    <li className={clsx(styles.cell, fresh && styles.fresh)}>
      <Surface as="article" aria-label={entry.name} padding="md" className={styles.card}>
        <div className={styles.cardInner}>
          <div className={styles.cardTop}>
            <Eyebrow>{entry.ruleset}</Eyebrow>
            {cardBadge(entry)}
          </div>
          <TableRing
            seats={seats}
            progress={progressOf(entry)}
            winners={winners}
            centre={<RingCentre entry={entry} />}
            label={`Seats at ${entry.name}, ${entry.seatsFilled} of ${entry.seatCount} taken`}
            joining={
              canJoin
                ? {
                    gameName: entry.name,
                    pending: pendingSeat,
                    onOffer: (index) => dispatch({ type: 'seatOffered', gameId: entry.gameId, index }),
                    onDecline: () => dispatch({ type: 'seatDeclined' }),
                    onTake: (index) => dispatch({ type: 'seatTaken', gameId: entry.gameId, index }),
                  }
                : undefined
            }
          />
          <div className={styles.details}>
            <Text fw={700} size="lg" lh={1.25} lineClamp={1} className={styles.name}>
              {entry.name}
            </Text>
            <Text size="sm" lh={1.35} className={styles.stage}>
              {entry.stage === 'play' ? `Turn ${turnOf(entry)} · ` : ''}
              {stageLine(entry)}
            </Text>
            {entry.stage === 'finished' ? <WinnerChips entry={entry} /> : null}
            <Text size="xs" c="dimmed" className={styles.host}>
              <Users size={12} aria-hidden /> {entry.seatsFilled} of {entry.seatCount} seated · set by{' '}
              {entry.host === VIEWER ? 'you' : entry.host}
            </Text>
            <div className={styles.footer}>
              <Text size="xs" c="dimmed" className={styles.age}>
                <Clock size={12} aria-hidden /> {ageWords(entry.lastActivityAt)}
              </Text>
              <Button
                size="compact-sm"
                className={styles.action}
                color={action.tone === 'join' ? 'confirm' : 'slate'}
                variant={action.tone === 'resume' || action.tone === 'join' ? 'filled' : 'light'}
                rightSection={action.icon}
                onClick={act}
              >
                {action.words}
              </Button>
            </div>
            {note === null ? null : (
              <div className={styles.note} role="status">
                <Text size="xs" lh={1.4}>
                  {note}
                </Text>
                <button
                  type="button"
                  className={styles.noteClose}
                  aria-label="Dismiss"
                  onClick={() => dispatch({ type: 'noteDismissed' })}
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
            )}
          </div>
        </div>
      </Surface>
    </li>
  );
}

/* A ghost table with empty seats, for the create card and the empty states. */
function GhostTable({ seats, size = 'card' }: Readonly<{ seats: number; size?: 'card' | 'small' }>) {
  return (
    <div className={clsx(styles.ring, styles.ghost, size === 'small' && styles.ringSmall)} aria-hidden>
      <TurnArc progress={null} />
      <div className={styles.centre}>
        <Plus className={styles.centreGlyph} />
      </div>
      {Array.from({ length: seats }, (_, index) => (
        <span
          key={index}
          className={clsx(styles.seat, styles.seatOpen)}
          style={seatPlacement(index, seats, seatSize(seats))}
        />
      ))}
    </div>
  );
}

function CreateCard({ onCreate }: Readonly<{ onCreate: () => void }>) {
  return (
    <li className={styles.cell}>
      <button type="button" className={styles.createCard} onClick={onCreate}>
        <GhostTable seats={6} />
        <span className={styles.createWords}>
          <Text component="span" fw={700} size="lg">
            Create a game
          </Text>
          <Text component="span" size="sm" c="dimmed">
            Set a table and invite your group.
          </Text>
        </span>
      </button>
    </li>
  );
}

const EMPTY_TAB: Record<Tab, string> = {
  open: 'No game is under way. Set a table and the room fills up.',
  yours: 'You hold no seat yet. Pick an open seat at any drafting table.',
  finished: 'No game has finished yet. Results land here.',
};

function EmptyTab({ tab, onBrowse }: Readonly<{ tab: Tab; onBrowse: () => void }>) {
  return (
    <li className={styles.cell}>
      <Surface padding="md" className={styles.card}>
        <Stack gap="sm" align="center" className={styles.emptyTab}>
          <Text size="sm" c="dimmed" ta="center">
            {EMPTY_TAB[tab]}
          </Text>
          {tab === 'yours' ? (
            <Button size="compact-sm" variant="light" onClick={onBrowse}>
              See open tables
            </Button>
          ) : null}
        </Stack>
      </Surface>
    </li>
  );
}

function EmptyRoom({ onCreate }: Readonly<{ onCreate: () => void }>) {
  return (
    <Surface padding="xl" as="section" aria-label="No tables yet">
      <div className={styles.emptyRoom}>
        <GhostTable seats={6} />
        <Stack gap="sm" className={styles.emptyWords}>
          <Eyebrow tone="accent">The room is quiet</Eyebrow>
          <Text fw={700} size="xl" lh={1.25}>
            No tables yet
          </Text>
          <Text c="dimmed" size="sm">
            Set the first table and invite your group. Everyone who joins takes a seat round it, and the game begins
            once every seat is filled.
          </Text>
          <Group>
            <CallToAction renderRoot={(props) => <button type="button" {...props} onClick={onCreate} />}>
              Create a game
            </CallToAction>
          </Group>
        </Stack>
      </div>
    </Surface>
  );
}

type CreateDraft = { name: string; ruleset: string; seats: number; open: boolean };
const BLANK_DRAFT: CreateDraft = { name: '', ruleset: RULESETS[0], seats: 6, open: true };

function CreateGameModal({
  opened,
  onClose,
  onCreate,
}: Readonly<{ opened: boolean; onClose: () => void; onCreate: (draft: CreateDraft) => void }>) {
  const [draft, setDraft] = useState(BLANK_DRAFT);
  const [tried, setTried] = useState(false);
  const nameMissing = draft.name.trim() === '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (nameMissing) {
      setTried(true);
      return;
    }
    onCreate({ ...draft, name: draft.name.trim() });
    setDraft(BLANK_DRAFT);
    setTried(false);
  };

  const previewSeats: Seat[] = Array.from({ length: draft.seats }, (_, index) => ({
    index,
    player: index === 0 ? { displayName: VIEWER, faction: null } : null,
    isViewer: index === 0,
  }));

  return (
    <Modal opened={opened} onClose={onClose} title="Create a game" centered size="lg">
      <form onSubmit={submit} className={styles.createForm}>
        <div className={styles.createPreview}>
          <TableRing
            seats={previewSeats}
            progress={null}
            size="small"
            label={`A table for ${draft.seats}, you in the first seat`}
            centre={
              <>
                <span className={styles.centreNumber}>{draft.seats}</span>
                <span className={styles.centreSmall}>seats</span>
              </>
            }
          />
          <Text size="xs" c="dimmed" ta="center">
            You take the first seat.
          </Text>
        </div>
        <Stack gap="sm" className={styles.createFields}>
          <TextInput
            label="Name"
            placeholder="Friday at the sietch"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            error={tried && nameMissing ? 'Give the game a name.' : undefined}
            data-autofocus
          />
          <Select
            label="Ruleset"
            data={[...RULESETS]}
            value={draft.ruleset}
            allowDeselect={false}
            onChange={(value) => setDraft({ ...draft, ruleset: value ?? RULESETS[0] })}
          />
          <NumberInput
            label="Seats"
            description="From 2 to 18 players round the table."
            min={2}
            max={18}
            clampBehavior="strict"
            value={draft.seats}
            onChange={(value) => setDraft({ ...draft, seats: typeof value === 'number' ? value : 6 })}
          />
          <Switch
            label="Open to anyone"
            description="Off keeps the table to players you send the link to."
            checked={draft.open}
            onChange={(event) => setDraft({ ...draft, open: event.currentTarget.checked })}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" color="confirm" leftSection={<Plus size={16} aria-hidden />}>
              Create game
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ResultModal({ entry, onClose }: Readonly<{ entry: DesignEntry | null; onClose: () => void }>) {
  const winners = entry?.result?.factions ?? [];
  return (
    <Modal opened={entry !== null} onClose={onClose} title={entry?.name ?? ''} centered>
      {entry === null ? null : (
        <Stack gap="md">
          <div className={styles.resultRing}>
            <TableRing
              seats={seatsOf(entry, undefined)}
              progress={null}
              winners={winners}
              size="small"
              label={`${entry.seatCount} seats`}
              centre={<RingCentre entry={entry} />}
            />
          </div>
          <Stack gap={4} align="center">
            <Text fw={700}>{resultWords(entry.result)}</Text>
            <Text size="xs" c="dimmed">
              {entry.ruleset} · ended {ageWords(entry.lastActivityAt)}
            </Text>
          </Stack>
          <ul className={styles.resultList}>
            {entry.players.map((player) => {
              const won = player.faction !== null && winners.includes(player.faction);
              return (
                <li key={player.displayName} className={clsx(styles.resultRow, won && styles.resultWinner)}>
                  <span
                    className={styles.resultDisc}
                    style={{ '--seat-fill': nameDiscColor(player.displayName) } as CSSProperties}
                    aria-hidden
                  >
                    {initialOf(player.displayName)}
                  </span>
                  <Text size="sm" fw={won ? 700 : 500}>
                    {player.displayName === VIEWER ? `${player.displayName} (you)` : player.displayName}
                  </Text>
                  <Text size="sm" c="dimmed" className={styles.resultFaction}>
                    {player.faction ?? 'No faction'}
                  </Text>
                  {won ? <Crown size={14} aria-label="Winner" /> : null}
                </li>
              );
            })}
          </ul>
        </Stack>
      )}
    </Modal>
  );
}

function Legend() {
  return (
    <ul className={styles.legend} aria-label="How to read a table">
      <li>
        <span className={clsx(styles.legendDisc, styles.legendTaken)} /> Seated
      </li>
      <li>
        <span className={clsx(styles.legendDisc, styles.legendViewer)} /> You
      </li>
      <li>
        <span className={clsx(styles.legendDisc, styles.legendOpen)} /> Open seat
      </li>
    </ul>
  );
}

export function GalleryLobby({ entries }: Readonly<{ entries: DesignEntry[] }>) {
  const [state, dispatch] = useReducer(lobbyReducer, {
    entries,
    chosenSeats: {},
    tab: 'open',
    pendingSeat: null,
    note: null,
    fresh: null,
  });
  const [creating, setCreating] = useState(false);
  const [resultFor, setResultFor] = useState<DesignEntry | null>(null);

  const counts: Record<Tab, number> = {
    open: gamesFor('open', state.entries).length,
    yours: gamesFor('yours', state.entries).length,
    finished: gamesFor('finished', state.entries).length,
  };
  const games = gamesFor(state.tab, state.entries);
  const tabLabel = (tab: Tab, words: string) => (
    <span className={styles.tabLabel}>
      {words}
      <span className={styles.tabCount}>{counts[tab]}</span>
    </span>
  );

  const create = (draft: CreateDraft) => {
    dispatch({
      type: 'gameCreated',
      entry: {
        gameId: `g-new-${state.entries.length + 1}`,
        name: draft.name,
        stage: 'drafting',
        seatsFilled: 1,
        seatCount: draft.seats,
        viewerSeated: true,
        players: [{ displayName: VIEWER, faction: null }],
        phase: null,
        lastActivityAt: NOW,
        result: null,
        ruleset: draft.ruleset,
        host: VIEWER,
      },
    });
    setCreating(false);
  };

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack gap={4}>
          <PageTitle title="Tables" eyebrow="Play" />
          <Text size="sm" className={styles.tagline}>
            Every game is a table. Take an open seat, return to your own, or pull up a chair and watch.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <div className={styles.root}>
          {state.entries.length === 0 ? (
            <EmptyRoom onCreate={() => setCreating(true)} />
          ) : (
            <>
              <div className={styles.toolbar}>
                <SegmentedControl
                  value={state.tab}
                  onChange={(value) => dispatch({ type: 'tabChosen', tab: value as Tab })}
                  className={styles.tabs}
                  data={[
                    { value: 'open', label: tabLabel('open', 'Open') },
                    { value: 'yours', label: tabLabel('yours', 'Yours') },
                    { value: 'finished', label: tabLabel('finished', 'Finished') },
                  ]}
                  aria-label="Which tables"
                />
                <Legend />
              </div>
              <ul className={styles.grid} aria-label="Tables">
                <CreateCard onCreate={() => setCreating(true)} />
                {games.length === 0 ? (
                  <EmptyTab tab={state.tab} onBrowse={() => dispatch({ type: 'tabChosen', tab: 'open' })} />
                ) : (
                  games.map((entry) => (
                    <GameCard
                      key={entry.gameId}
                      entry={entry}
                      chosenSeat={state.chosenSeats[entry.gameId]}
                      pendingSeat={state.pendingSeat?.gameId === entry.gameId ? state.pendingSeat.index : null}
                      note={state.note?.gameId === entry.gameId ? state.note.words : null}
                      fresh={state.fresh === entry.gameId}
                      dispatch={dispatch}
                      onShowResult={setResultFor}
                    />
                  ))
                )}
              </ul>
            </>
          )}
        </div>
        <CreateGameModal opened={creating} onClose={() => setCreating(false)} onCreate={create} />
        <ResultModal entry={resultFor} onClose={() => setResultFor(null)} />
      </PageLayout.Content>
    </PageLayout>
  );
}

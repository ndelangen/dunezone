import { Anchor, Button, Group, Select, Stack, Text, Title, Tooltip } from '@mantine/core';
import type { playLobbyEntrySchema } from '@shared/play/directory';
import { phaseAt, STANDARD_PHASES, tableProgressFor } from '@shared/play/phases';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { formatRelativeDate } from '@ui/content/dates';
import { nameDiscColor } from '@ui/content/nameDisc';
import { StatusBadge } from '@ui/content/StatusBadge';
import { CallToAction } from '@ui/control/CallToAction';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import clsx from 'clsx';
import { ArrowRight, Clock, Crown, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { z } from 'zod';

import { useLobbyGames } from '@db/play';
import { pageHead } from '@app/routes/pageTitle';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

import styles from './index.module.css';
import { SERVER_UNREACHABLE, useServerUnreachable } from './useServerUnreachable';

/*
 * The lobby lists what the directory holds and nothing more; it never loads the 3D runtime.
 * Any signed-in player sees every listed game. Nothing in the app links here: the lobby stays unlisted
 * (and noindex) until the public-release decision.
 * Every game is a table with its seats drawn round it (direction C of #1739), so a glance tells who sits where, which seats are free and how far the game has come.
 */
export const Route = createFileRoute('/_app/play/')({
  head: () => pageHead('Play Dune!', { noindex: true }),
  component: PlayLobby,
});

type LobbyEntry = z.infer<typeof playLobbyEntrySchema>;
type Player = LobbyEntry['players'][number];
type View = 'ongoing' | 'yours' | 'finished';

const STAGE_WORDS: Record<LobbyEntry['stage'], string> = {
  drafting: 'Drafting',
  swapping: 'Swapping',
  setup: 'Setup',
  play: 'In play',
  finished: 'Finished',
  discarded: 'Discarded',
};

/* The turn tracker's ten sectors: the ring fills towards the last of them. */
const TURNS = 10;

const turnOf = (entry: LobbyEntry) =>
  entry.stage === 'play' && entry.phase !== null ? tableProgressFor(entry.phase).turn : null;

function resultWords(result: LobbyEntry['result']): string | null {
  switch (result?.kind) {
    case undefined:
      return null;
    case 'none':
      return 'No winner';
    case 'faction':
      return `${result.factions.join(', ')} won`;
    case 'alliance':
      return `${result.factions.join(' and ')} won together`;
  }
}

/** Where a game stands, in words: the phase in play, the result once finished, the stage and its free seats before. */
function whereWords(entry: LobbyEntry): string {
  if (entry.stage === 'play' && entry.phase !== null) {
    return `Turn ${turnOf(entry)} · ${phaseAt(entry.phase).label}`;
  }
  if (entry.stage === 'finished') {
    return resultWords(entry.result) ?? STAGE_WORDS.finished;
  }
  const open = entry.seatCount - entry.seatsFilled;
  return open > 0
    ? `${STAGE_WORDS[entry.stage]}, ${open} ${open === 1 ? 'seat' : 'seats'} open`
    : STAGE_WORDS[entry.stage];
}

function gamesFor(view: View, ongoing: LobbyEntry[], past: LobbyEntry[]): LobbyEntry[] {
  switch (view) {
    case 'ongoing':
      /* Your own games first; the directory already sorts by activity within each. */
      return [...ongoing.filter((entry) => entry.viewerSeated), ...ongoing.filter((entry) => !entry.viewerSeated)];
    case 'yours':
      return ongoing.filter((entry) => entry.viewerSeated);
    case 'finished':
      return past;
  }
}

function matches(entry: LobbyEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return (
    needle.length === 0 ||
    [entry.name, ...entry.players.map((player) => player.displayName)].some((words) =>
      words.toLowerCase().includes(needle)
    )
  );
}

/*
 * Ring geometry, in the 100-unit box the table is drawn in.
 * Seats sit on the outer circle; a disc grows to the gap between neighbours and never past a comfortable size.
 */
const SEAT_RADIUS = 42;
const TABLE_RADIUS = 28;
const ARC_RADIUS = 32;
const ARC_LENGTH = 2 * Math.PI * ARC_RADIUS;

function seatPlacement(index: number, count: number): CSSProperties {
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  const size = Math.min(19, 0.84 * 2 * SEAT_RADIUS * Math.sin(Math.PI / count));
  return {
    '--seat-x': `${50 + SEAT_RADIUS * Math.cos(angle)}%`,
    '--seat-y': `${50 + SEAT_RADIUS * Math.sin(angle)}%`,
    '--seat-size': `${size}cqi`,
  } as CSSProperties;
}

/* Ten ticks round the table, one per turn, and an arc for how much of the game has been played. */
function TableArt({ progress }: Readonly<{ progress: number | null }>) {
  return (
    <svg className={styles.tableArt} viewBox="0 0 100 100" aria-hidden>
      <circle className={styles.tableTop} cx="50" cy="50" r={TABLE_RADIUS} />
      <circle className={styles.tableInlay} cx="50" cy="50" r={TABLE_RADIUS - 3.5} />
      {progress === null ? null : (
        <>
          {Array.from({ length: TURNS }, (_, turn) => {
            const angle = (turn / TURNS) * 2 * Math.PI - Math.PI / 2;
            const inner = ARC_RADIUS - 1.4;
            const outer = ARC_RADIUS + 1.4;
            return (
              <line
                key={turn}
                className={styles.tick}
                x1={50 + inner * Math.cos(angle)}
                y1={50 + inner * Math.sin(angle)}
                x2={50 + outer * Math.cos(angle)}
                y2={50 + outer * Math.sin(angle)}
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

function seatWords(player: Player, won: boolean): string {
  const who = player.viewer ? `${player.displayName} (you)` : player.displayName;
  const faction = player.faction ? player.faction.name : 'no faction yet';
  return `${who}, ${faction}${won ? ', a winner' : ''}`;
}

/* A taken seat: the player's avatar, with their faction's token pinned to it once the faction is public. */
function TakenSeat({ player, won, style }: Readonly<{ player: Player; won: boolean; style: CSSProperties }>) {
  const words = seatWords(player, won);
  return (
    <Tooltip label={words} withArrow>
      <span
        role="img"
        aria-label={words}
        className={clsx(styles.seat, styles.seatTaken, player.viewer && styles.seatViewer)}
        style={
          {
            ...style,
            '--seat-fill': nameDiscColor(player.displayName),
            '--seat-edge': player.faction?.color ?? 'var(--color-paper)',
          } as CSSProperties
        }
      >
        {player.avatarUrl ? (
          <img className={styles.avatar} src={player.avatarUrl} alt="" />
        ) : (
          <span className={styles.initial}>{player.displayName.trim().charAt(0).toUpperCase()}</span>
        )}
        {player.faction?.token ? (
          <span className={styles.faction}>
            <FactionToken logo={player.faction.token.logo} background={player.faction.token.background} />
          </span>
        ) : null}
        {won ? (
          <span className={styles.crown}>
            <Crown aria-hidden />
          </span>
        ) : null}
      </span>
    </Tooltip>
  );
}

function TableRing({ entry }: Readonly<{ entry: LobbyEntry }>) {
  const seats = Math.max(entry.seatCount, entry.players.length);
  const progress =
    entry.stage === 'play' && entry.phase !== null
      ? Math.min(1, (entry.phase + 1) / (TURNS * STANDARD_PHASES.length))
      : null;
  return (
    <div
      className={styles.ring}
      role="group"
      aria-label={`Seats at ${entry.name}, ${entry.seatsFilled} of ${entry.seatCount} taken`}
    >
      <TableArt progress={progress} />
      <div className={styles.centre}>
        <RingCentre entry={entry} />
      </div>
      {Array.from({ length: seats }, (_, index) => {
        const placement = seatPlacement(index, seats);
        const player = entry.players[index];
        if (!player) {
          return (
            <span
              key={index}
              role="img"
              aria-label="Open seat"
              className={clsx(styles.seat, styles.seatOpen)}
              style={placement}
            />
          );
        }
        return <TakenSeat key={index} player={player} won={player.faction?.won ?? false} style={placement} />;
      })}
    </div>
  );
}

/* What sits in the middle of the table: the turn in play, the stage before play, a trophy once it is over. */
function RingCentre({ entry }: Readonly<{ entry: LobbyEntry }>) {
  const turn = turnOf(entry);
  if (entry.stage === 'finished') {
    return entry.result?.kind === 'none' ? (
      <span className={styles.centreWord}>{STAGE_WORDS.finished}</span>
    ) : (
      <Trophy aria-hidden className={styles.centreGlyph} />
    );
  }
  if (turn !== null) {
    return (
      <>
        <span className={styles.centreSmall}>Turn</span>
        <span className={styles.centreNumber}>{turn}</span>
        {turn <= TURNS ? <span className={styles.centreSmall}>of {TURNS}</span> : null}
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

/** A game still under way with a seat nobody holds. */
function hasFreeSeat(entry: LobbyEntry): boolean {
  return entry.stage !== 'finished' && entry.stage !== 'discarded' && entry.seatsFilled < entry.seatCount;
}

function cardBadge(entry: LobbyEntry): ReactNode {
  if (entry.viewerSeated) {
    return <StatusBadge tone="brand">{entry.stage === 'finished' ? 'You played' : 'Your seat'}</StatusBadge>;
  }
  if (hasFreeSeat(entry)) {
    return <StatusBadge tone="positive">Seats open</StatusBadge>;
  }
  return null;
}

function GameCard({ entry }: Readonly<{ entry: LobbyEntry }>) {
  return (
    <li className={styles.cell}>
      <Card title={entry.name} action={cardBadge(entry)} padding="md" className={styles.card}>
        <div className={styles.cardBody}>
          <TableRing entry={entry} />
          <div className={styles.details}>
            <Text size="sm" fw={600} lh={1.35}>
              {whereWords(entry)}
            </Text>
            <Text size="xs" c="dimmed">
              {entry.seatsFilled} of {entry.seatCount} seated
            </Text>
            <div className={styles.footer}>
              <Text size="xs" c="dimmed" className={styles.age}>
                <Clock size={12} aria-hidden /> {formatRelativeDate(new Date(entry.lastActivityAt).toISOString())}
              </Text>
              <Button
                renderRoot={(rootProps) => <Link {...rootProps} to="/play/$gameId" params={{ gameId: entry.gameId }} />}
                size="compact-sm"
                color="slate"
                variant={entry.viewerSeated ? 'filled' : 'light'}
                rightSection={<ArrowRight size={15} aria-hidden />}
                aria-label={`Open ${entry.name}`}
              >
                Open
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </li>
  );
}

const EMPTY_WORDS: Record<View, string> = {
  ongoing: 'No game is under way.',
  yours: 'You hold no seat in a game under way.',
  finished: 'No game has finished yet.',
};

function EmptyView({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Surface padding="xl">
      <Stack gap="xs" align="center" ta="center">
        <Title order={2}>{title}</Title>
        <Text c="dimmed">{children}</Text>
      </Stack>
    </Surface>
  );
}

/* Convex retries on its own; after a while the wait says so and offers the way home. */
function LobbyWait({ status }: Readonly<{ status: 'sign_in_required' | undefined }>) {
  const unreachable = useServerUnreachable(status === undefined);
  switch (status) {
    case 'sign_in_required':
      return <Text c="dimmed">Ongoing and past games appear here once you sign in.</Text>;
    case undefined:
      break;
  }
  if (!unreachable) {
    return <Text c="dimmed">Loading games.</Text>;
  }
  return (
    <Stack gap="xs" role="status">
      <Text c="dimmed">{SERVER_UNREACHABLE}</Text>
      <Anchor component={Link} to="/">
        Go back home
      </Anchor>
    </Stack>
  );
}

const createLink = (rootProps: object) => <Link {...rootProps} to="/play/create" />;

function LobbyToolbar({
  query,
  onQueryChange,
  view,
  onViewChange,
  counts,
}: Readonly<{
  query: string;
  onQueryChange: (query: string) => void;
  view: View;
  onViewChange: (view: View) => void;
  counts: Record<View, number>;
}>) {
  const viewSelect = (label?: string, joined = false) => (
    <Select
      variant={joined ? 'unstyled' : 'default'}
      label={label}
      value={view}
      data={[
        { value: 'ongoing', label: `Ongoing (${counts.ongoing})` },
        { value: 'yours', label: `Yours (${counts.yours})` },
        { value: 'finished', label: `Finished (${counts.finished})` },
      ]}
      allowDeselect={false}
      onChange={(value) => onViewChange((value as View | null) ?? 'ongoing')}
      aria-label="Show games"
    />
  );
  return (
    <Toolbar>
      <Toolbar.Center>
        <SearchRefine
          label="Game lobby filters"
          search={{
            value: query,
            onChange: onQueryChange,
            onCommit: () => {},
            label: 'Search games',
            placeholder: 'Search games or players…',
          }}
          refine={{ label: 'Choose games', active: view === 'ongoing' ? 0 : 1, content: viewSelect('Show') }}
        >
          {viewSelect(undefined, true)}
        </SearchRefine>
      </Toolbar.Center>
    </Toolbar>
  );
}

function PlayLobby() {
  const { data: lobby } = useLobbyGames();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('ongoing');
  const ready = lobby?.status === 'ready' ? lobby : null;
  const hasGames = ready !== null && ready.ongoing.length + ready.past.length > 0;
  const waiting = ready?.ongoing.filter((entry) => !entry.viewerSeated && hasFreeSeat(entry)).length ?? 0;

  return (
    <PageLayout>
      <PageLayout.Header>
        <Group justify="space-between" align="center" wrap="wrap" gap="md" w="100%">
          <Stack gap="xs" miw={0}>
            <PageTitle title="Play Dune!" />
            <p className={styles.subtitle}>
              Welcome to the lobby
              {waiting > 0 ? (
                <span className={styles.count}>
                  {' · '}
                  {waiting} {waiting === 1 ? 'table has' : 'tables have'} a free seat
                </span>
              ) : null}
            </p>
          </Stack>
          <CallToAction direction="start" size="lg" renderRoot={createLink}>
            Create a game
          </CallToAction>
        </Group>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        {hasGames ? (
          <LobbyToolbar
            query={query}
            onQueryChange={setQuery}
            view={view}
            onViewChange={setView}
            counts={{
              ongoing: ready.ongoing.length,
              yours: ready.ongoing.filter((entry) => entry.viewerSeated).length,
              finished: ready.past.length,
            }}
          />
        ) : undefined}
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <LobbyContent
          ready={ready}
          status={lobby?.status === 'ready' ? undefined : lobby?.status}
          query={query}
          view={view}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}

function LobbyContent({
  ready,
  status,
  query,
  view,
}: Readonly<{
  ready: { ongoing: LobbyEntry[]; past: LobbyEntry[] } | null;
  status: 'sign_in_required' | undefined;
  query: string;
  view: View;
}>) {
  if (!ready) {
    return (
      <Surface padding="xl">
        <LobbyWait status={status} />
      </Surface>
    );
  }
  if (ready.ongoing.length + ready.past.length === 0) {
    return <EmptyView title="No games yet">Create a game to set the first table.</EmptyView>;
  }
  const games = gamesFor(view, ready.ongoing, ready.past).filter((entry) => matches(entry, query));
  if (games.length === 0) {
    return query.trim() ? (
      <EmptyView title="No game matches">Nothing here matches “{query.trim()}”.</EmptyView>
    ) : (
      <EmptyView title="Nothing here">{EMPTY_WORDS[view]}</EmptyView>
    );
  }
  return (
    <div className={styles.room}>
      <ul className={styles.grid} aria-label="Games">
        {games.map((entry) => (
          <GameCard key={entry.gameId} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

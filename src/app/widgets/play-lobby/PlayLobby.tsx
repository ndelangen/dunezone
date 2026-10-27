import { Button, Group, Select, Stack, Text, Title } from '@mantine/core';
import type { playLobbyEntrySchema } from '@shared/play/directory';
import { phaseAt, STANDARD_PHASES, tableProgressFor } from '@shared/play/phases';
import { PageTitle } from '@ui/block/PageTitle';
import { formatRelativeDate } from '@ui/content/dates';
import { nameDiscColor } from '@ui/content/nameDisc';
import { SeatedTable, TableCentre } from '@ui/content/SeatedTable';
import type { TableSeat } from '@ui/content/SeatedTable';
import { StatusBadge } from '@ui/content/StatusBadge';
import { CallToAction } from '@ui/control/CallToAction';
import { IconAction } from '@ui/control/IconAction';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowRight, Clock, GraduationCap, ListFilter, Plus, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import styles from './PlayLobby.module.css';

/*
 * The lobby page's body, for the Play lobby and for the tutorial chapter that teaches it: the games as tables, their search, and the ways on.
 * Every game is a table with its seats drawn round it (direction C of #1739), so a glance tells who sits where, which seats are free and how far the game has come.
 * Its header leads to the tutorial (Norbert, 2026-10-23), the one place that links there.
 */

/** A link the lobby leads on with, as a button's root. */
type RootLink = (rootProps: object) => ReactNode;

/** Where the lobby leads: creating a game, the tutorial, and each listed game by its address. */
export type PlayLobbyLinks = Readonly<{
  createLink: RootLink;
  /** Why creating a game is not open yet, when it is not; the create buttons show disabled and say why. */
  createDisabledReason?: string | undefined;
  tutorialLink: RootLink;
  gameLink: (address: string) => RootLink;
}>;

type LobbyEntry = z.infer<typeof playLobbyEntrySchema>;
type Player = LobbyEntry['players'][number];
type View = 'ongoing' | 'yours' | 'finished';
/** The games the lobby lists, under way and past. */
export type LobbyGames = Readonly<{ ongoing: LobbyEntry[]; past: LobbyEntry[] }>;

const STAGE_WORDS: Record<LobbyEntry['stage'], string> = {
  drafting: 'Drafting',
  swapping: 'Swapping',
  setup: 'Setup',
  play: 'In play',
  finished: 'Finished',
  discarded: 'Discarded',
};

/* The turn tracker's ten sectors: the table's arc fills towards the last of them. */
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
    [entry.name, entry.rulesetName ?? '', ...entry.players.map((player) => player.displayName)].some((words) =>
      words.toLowerCase().includes(needle)
    )
  );
}

/*
 * Ring geometry, in the 100-unit box the table is drawn in.
 * Seats sit on the outer circle; a disc grows to the gap between neighbours and never past a comfortable size.
 */
function seatWords(player: Player, won: boolean): string {
  const who = player.viewer ? `${player.displayName} (you)` : player.displayName;
  const faction = player.faction ? player.faction.name : 'no faction yet';
  return `${who}, ${faction}${won ? ', a winner' : ''}`;
}

/* A taken seat: the player's avatar, with their faction's token pinned to it once the faction is public. */
function tableSeat(player: Player): TableSeat {
  const won = player.faction?.won ?? false;
  return {
    label: seatWords(player, won),
    fill: nameDiscColor(player.displayName),
    edge: player.faction?.color ?? null,
    image: player.avatarUrl ?? null,
    initial: player.displayName.trim().charAt(0).toUpperCase(),
    badge: player.faction?.token ? (
      <FactionToken logo={player.faction.token.logo} background={player.faction.token.background} />
    ) : null,
    crowned: won,
    highlighted: player.viewer,
  };
}

function TableRing({ entry }: Readonly<{ entry: LobbyEntry }>) {
  const seats = Math.max(entry.seatCount, entry.players.length);
  const progress =
    entry.stage === 'play' && entry.phase !== null
      ? Math.min(1, (entry.phase + 1) / (TURNS * STANDARD_PHASES.length))
      : null;
  return (
    <SeatedTable
      label={`Seats at ${entry.name}, ${entry.seatsFilled} of ${entry.seatCount} taken`}
      seats={Array.from({ length: seats }, (_, index) => {
        const player = entry.players[index];
        return player ? tableSeat(player) : null;
      })}
      progress={progress}
      turns={TURNS}
      centre={<RingCentre entry={entry} />}
    />
  );
}

/* What sits in the middle of the table: the turn in play, the stage before play, a trophy once it is over. */
function RingCentre({ entry }: Readonly<{ entry: LobbyEntry }>) {
  const turn = turnOf(entry);
  if (entry.stage === 'finished') {
    return entry.result?.kind === 'none' ? (
      <TableCentre word={STAGE_WORDS.finished} />
    ) : (
      <TableCentre glyph={<Trophy aria-hidden />} />
    );
  }
  if (turn !== null) {
    return <TableCentre above="Turn" number={turn} below={turn <= TURNS ? `of ${TURNS}` : undefined} />;
  }
  return <TableCentre word={STAGE_WORDS[entry.stage]} below={`${entry.seatsFilled} of ${entry.seatCount}`} />;
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

function GameCard({ entry, gameLink }: Readonly<{ entry: LobbyEntry; gameLink: PlayLobbyLinks['gameLink'] }>) {
  return (
    <li className={styles.cell}>
      <Card title={entry.name} action={cardBadge(entry)} padding="md" className={styles.card}>
        <div className={styles.cardBody}>
          <TableRing entry={entry} />
          <div className={styles.details}>
            {entry.rulesetName ? (
              <Text size="xs" c="dimmed">
                Ruleset: {entry.rulesetName}
              </Text>
            ) : null}
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
                renderRoot={gameLink(entry.slug ?? entry.gameId)}
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

function LobbyToolbar({
  query,
  onQueryChange,
  view,
  onViewChange,
  counts,
  createLink,
  createDisabledReason,
}: Readonly<{
  query: string;
  onQueryChange: (query: string) => void;
  view: View;
  onViewChange: (view: View) => void;
  counts: Record<View, number>;
  createLink: RootLink;
  createDisabledReason: string | undefined;
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
      leftSection={<ListFilter size={15} aria-hidden />}
    />
  );
  return (
    <Toolbar>
      <Toolbar.Center>
        <SearchRefine
          label="Lobby filters"
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
      <Toolbar.Right label="Lobby actions">
        <IconAction
          label="Create a game"
          emphasis="strong"
          intent="positive"
          size="lg"
          renderRoot={createLink}
          disabledReason={createDisabledReason}
          icon={<Plus size={17} aria-hidden />}
        />
      </Toolbar.Right>
    </Toolbar>
  );
}

/**
 * The lobby: every game under way and past, and the way to create one.
 * The page hands it the games, or what to show while there are none to list yet, and the links it leads on with.
 */
export function PlayLobby({
  games: ready,
  waiting,
  createLink,
  createDisabledReason,
  tutorialLink,
  gameLink,
}: Readonly<{ games: LobbyGames | null; waiting: ReactNode } & PlayLobbyLinks>) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('ongoing');
  const hasGames = ready !== null && ready.ongoing.length + ready.past.length > 0;

  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack gap="md" miw={0} align="center" ta="center">
          <PageTitle title="Play Dune!" subtitle="Welcome to the lobby" />
          <Text size="lg" fw={500} maw="36rem">
            Take a seat, choose your faction, and fight for Arrakis.
          </Text>
          <Group gap="sm" justify="center">
            <Button
              variant="default"
              size="lg"
              leftSection={<GraduationCap size={17} aria-hidden />}
              renderRoot={tutorialLink}
            >
              Learn to play
            </Button>
            <CallToAction direction="start" size="lg" renderRoot={createLink} disabledReason={createDisabledReason}>
              Create a game
            </CallToAction>
          </Group>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        {hasGames ? (
          <LobbyToolbar
            query={query}
            onQueryChange={setQuery}
            view={view}
            onViewChange={setView}
            createLink={createLink}
            createDisabledReason={createDisabledReason}
            counts={{
              ongoing: ready.ongoing.length,
              yours: ready.ongoing.filter((entry) => entry.viewerSeated).length,
              finished: ready.past.length,
            }}
          />
        ) : undefined}
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <LobbyContent ready={ready} waiting={waiting} query={query} view={view} gameLink={gameLink} />
      </PageLayout.Content>
    </PageLayout>
  );
}

function LobbyContent({
  ready,
  waiting,
  query,
  view,
  gameLink,
}: Readonly<{
  ready: LobbyGames | null;
  waiting: ReactNode;
  query: string;
  view: View;
  gameLink: PlayLobbyLinks['gameLink'];
}>) {
  if (!ready) {
    return <Surface padding="xl">{waiting}</Surface>;
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
          <GameCard key={entry.gameId} entry={entry} gameLink={gameLink} />
        ))}
      </ul>
    </div>
  );
}

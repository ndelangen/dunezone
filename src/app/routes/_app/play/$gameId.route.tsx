import { useConvexAuth } from '@convex-dev/auth/react';
import { Button, Stack } from '@mantine/core';
import { ClientOnly, createFileRoute, Link, redirect } from '@tanstack/react-router';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Orbit } from 'lucide-react';
import { lazy, Suspense, useContext, useEffect, useMemo, useReducer, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { rememberSeatPass, useGameAccess } from '@db/play';
import { forgetStoredPlayTable } from '@db/playTables';
import { pageHead } from '@app/routes/pageTitle';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { GameLink } from './GameLink';
import type { GameRuntime } from './multiplayer/gameRuntime';
import { GameRuntimeContext } from './multiplayer/gameRuntime';
import { TableWait } from './TableWait';
import { SERVER_UNREACHABLE, useServerUnreachable } from './useServerUnreachable';

/*
 * The table's own lazy parts start alongside its bundle, so they do not wait for it to render.
 * Their list is fetched too, rather than imported, since this route's loader is part of every page's entry.
 */
const loadHostedTable = () => {
  import('@app/widgets/tabletop/tableChunks').then(
    ({ preloadTableChunks }) => preloadTableChunks(),
    () => {}
  );
  return import('./multiplayer/HostedTable');
};
const HostedTable = lazy(loadHostedTable);

/*
 * The retired Demo and Hosted pages (#1296) lived at these addresses. Old links and bookmarks land in the
 * lobby rather than on a game page that asks to sign in for a game that never existed.
 */
const RETIRED_PAGES: ReadonlySet<string> = new Set(['demo', 'hosted']);

export const Route = createFileRoute('/_app/play/$gameId')({
  beforeLoad: ({ params }) => {
    if (RETIRED_PAGES.has(params.gameId)) {
      throw redirect({ to: '/play', replace: true });
    }
  },
  /* Starts the table bundle with the route, and on an intent preload, so the frame never waits for it after the directory answers. */
  loader: () => {
    void loadHostedTable();
  },
  head: () => pageHead('Game', { noindex: true }),
  component: GamePage,
});

/*
 * A game's one route: the current stage in a persistent frame, whatever the stage.
 * The frame is there from the first render, while the directory is still answering, and the table chunk
 * and the connection are reported as text inside it. Before the socket opens the page says only what the
 * directory allows: a game the viewer may not enter is not found, a pending game is preparing, an
 * expired one could not be prepared, and each of those is its own page.
 */
function storedGameReader(tables: GameRuntime['tables'], address: string) {
  let found: string | null | undefined;
  return () => {
    if (found === undefined) {
      found = tables?.findGame(address) ?? null;
    }
    return found;
  };
}

function GamePage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  /* Local sign-out fences the table before a delayed directory query can replace its last access answer. */
  return !isLoading && !isAuthenticated ? <GameLoginGate /> : <GameAccessPage />;
}

function GameLoginGate() {
  return (
    <PageMessage size="compact" title="Game">
      <LoginGate action="open a game" />
    </PageMessage>
  );
}

function GameAccessPage() {
  const { gameId: address } = Route.useParams();
  const navigate = Route.useNavigate();
  const runtime = useContext(GameRuntimeContext);
  const { data } = useGameAccess(address);
  const authorized = data && 'gameId' in data ? data : null;
  const current = useKnownGame(address, authorized);
  const unreachable = useServerUnreachable(data === undefined);
  /* Finding the kept table parses it from storage, so it is read once per address, misses included, rather than on every render. */
  const readStored = useMemo(() => storedGameReader(runtime.tables, address), [runtime, address]);
  const stored = useSyncExternalStore(noSubscription, readStored, () => null);
  const refused = data !== undefined && data.status !== 'ready' && data.status !== 'preparing';
  /* The game's seat pass rides on the access answer and renews with it. */
  const seatPass = data?.status === 'ready' ? data.pass : null;
  const passGameId = data?.status === 'ready' ? data.gameId : null;
  useEffect(() => {
    if (passGameId) {
      rememberSeatPass(passGameId, seatPass);
    }
  }, [passGameId, seatPass]);
  useEffect(() => {
    const forget = (gameId: string) => {
      forgetStoredPlayTable(gameId);
      runtime.tables?.clear(gameId);
    };
    if (stored && (refused || (authorized && authorized.gameId !== stored))) {
      forget(stored);
    }
    if (refused && current) {
      forget(current.gameId);
    }
  }, [refused, stored, authorized, current, runtime]);
  useEffect(() => {
    if (!authorized?.slug) {
      return;
    }
    runtime.tables?.rememberAddress(authorized.gameId, authorized.slug);
    if (address === authorized.slug) {
      return;
    }
    void navigate({
      to: '/play/$gameId',
      params: { gameId: authorized.slug },
      search: true,
      hash: true,
      replace: true,
      resetScroll: false,
    });
  }, [authorized, address, navigate, runtime]);
  const exit = (
    <Button component={Link} to="/play" variant="default" aria-label="Back to lobby">
      Lobby
    </Button>
  );
  switch (data?.status) {
    case undefined:
      /* A reloaded tab that kept this table shows it, locked, while the directory has not answered (#1746). */
      if (current?.status === 'ready' || stored) {
        return <TablePage game={current ?? { gameId: stored!, name: 'Game', slug: stored! }} exit={exit} />;
      }
      return (
        <TableFrame title="Game">
          <TableWait status={unreachable ? SERVER_UNREACHABLE : 'Loading the game...'}>{exit}</TableWait>
        </TableFrame>
      );
    case 'sign_in_required':
      return <GameLoginGate />;
    case 'not_found':
      return (
        <UnavailableTable title="This game is not available" exit={exit}>
          There is no game you can open at this address.
        </UnavailableTable>
      );
    case 'preparing':
      return (
        /* The same dark frame the table loads in, so the create page's fade to black opens straight onto it. */
        <TableFrame title={data.name}>
          <TableWait status="Preparing the table">
            <ClientOnly>
              <GameLink address={data.slug ?? data.gameId} />
            </ClientOnly>
            {exit}
          </TableWait>
        </TableFrame>
      );
    case 'unavailable':
      return (
        <UnavailableTable title="This game could not be prepared" exit={exit}>
          {data.reason ?? 'The table was not ready in time. Create the game again from the lobby.'}
        </UnavailableTable>
      );
    case 'ready':
      return <TablePage game={data} exit={exit} />;
  }
}

function UnavailableTable({ title, children, exit }: Readonly<{ title: string; children: string; exit: ReactNode }>) {
  return (
    <TableFrame title="Game">
      <TableWait
        status={
          <Stack gap="lg" align="center">
            <Orbit size={64} strokeWidth={1} aria-hidden style={{ color: 'var(--color-muted)' }} />
            <NotAvailable title={title}>{children}</NotAvailable>
          </Stack>
        }
      >
        {exit}
      </TableWait>
    </TableFrame>
  );
}

const noSubscription = () => () => {};
type GameAccess = NonNullable<ReturnType<typeof useGameAccess>['data']>;
type KnownGame = Pick<Extract<GameAccess, { gameId: string }>, 'gameId' | 'slug' | 'name' | 'status'> & {
  ruleset?: Extract<GameAccess, { status: 'ready' }>['ruleset'];
};
type GamePageEvent = { type: 'resolved'; game: KnownGame };

/* The game the directory resolved, or the one it last resolved at this address while it has not answered again. */
function useKnownGame(address: string, authorized: Extract<GameAccess, { gameId: string }> | null) {
  const [known, remember] = useReducer((_previous: KnownGame | null, event: GamePageEvent) => event.game, null);
  if (
    authorized &&
    (known?.gameId !== authorized.gameId ||
      known.slug !== authorized.slug ||
      known.name !== authorized.name ||
      known.status !== authorized.status)
  ) {
    remember({
      type: 'resolved',
      game: {
        gameId: authorized.gameId,
        slug: authorized.slug,
        name: authorized.name,
        status: authorized.status,
        ruleset: 'ruleset' in authorized ? authorized.ruleset : undefined,
      },
    });
  }
  return authorized ?? (known && (address === known.gameId || address === known.slug) ? known : null);
}

/* The dark full-screen frame a game's table loads in, under the game's name. */
function TableFrame({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header size="compact">
        <PageTitle title={title} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">{children}</PageLayout.Content>
    </PageLayout>
  );
}

/* One element for a ready game and for a kept table, so the table a reload restored stays mounted when the directory answers. */
function TablePage({
  game,
  exit,
}: Readonly<{ game: Omit<KnownGame, 'status' | 'gameId'> & { gameId: string }; exit: ReactNode }>) {
  const loading = <TableWait status="Loading the table...">{exit}</TableWait>;
  return (
    <TableFrame title={game.name}>
      <ClientOnly fallback={loading}>
        <Suspense fallback={loading}>
          <HostedTable
            key={game.gameId}
            gameId={game.gameId}
            exitControl={exit}
            identity={{ rulesetName: game.ruleset?.name ?? null, address: game.slug ?? game.gameId }}
          />
        </Suspense>
      </ClientOnly>
    </TableFrame>
  );
}

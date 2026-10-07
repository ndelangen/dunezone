import { Button } from '@mantine/core';
import { ClientOnly, createFileRoute, Link, redirect } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense, useContext, useEffect, useReducer, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { useGameAccess } from '@db/play';
import { forgetStoredPlayTable } from '@db/playTables';
import { pageHead } from '@app/routes/pageTitle';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { GameRuntimeContext } from './multiplayer/gameRuntime';
import { TableWait } from './TableWait';
import { SERVER_UNREACHABLE, useServerUnreachable } from './useServerUnreachable';

const loadHostedTable = () => import('./multiplayer/HostedTable');
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
function GamePage() {
  const { gameId: address } = Route.useParams();
  const navigate = Route.useNavigate();
  const runtime = useContext(GameRuntimeContext);
  const { data } = useGameAccess(address);
  const [known, remember] = useReducer((_previous: KnownGame | null, event: GamePageEvent) => event.game, null);
  const authorized = data && 'gameId' in data ? data : null;
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
      },
    });
  }
  const current = authorized ?? (known && (address === known.gameId || address === known.slug) ? known : null);
  const unreachable = useServerUnreachable(data === undefined);
  const stored = useSyncExternalStore(
    noSubscription,
    () => runtime.tables?.findGame(address) ?? null,
    () => null
  );
  const refused = data !== undefined && data.status !== 'ready' && data.status !== 'preparing';
  useEffect(() => {
    if (stored && (refused || (authorized && authorized.gameId !== stored))) {
      forgetStoredPlayTable(stored);
      runtime.tables?.clear(stored);
    }
    if (refused && current) {
      forgetStoredPlayTable(current.gameId);
      runtime.tables?.clear(current.gameId);
    }
  }, [refused, stored, authorized, current, runtime]);
  useEffect(() => {
    if (authorized?.slug) {
      runtime.tables?.rememberAddress(authorized.gameId, authorized.slug);
      if (address !== authorized.slug) {
        void navigate({
          to: '/play/$gameId',
          params: { gameId: authorized.slug },
          search: true,
          hash: true,
          replace: true,
          resetScroll: false,
        });
      }
    }
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
        return <TablePage title={current?.name ?? 'Game'} gameId={current?.gameId ?? stored!} exit={exit} />;
      }
      return (
        <PageLayout height="fullscreen">
          <PageLayout.Header size="compact">
            <PageTitle title="Game" />
          </PageLayout.Header>
          <PageLayout.Content width="viewport">
            <TableWait status={unreachable ? SERVER_UNREACHABLE : 'Loading the game...'}>{exit}</TableWait>
          </PageLayout.Content>
        </PageLayout>
      );
    case 'sign_in_required':
      return (
        <PageMessage size="compact" title="Game">
          <LoginGate action="open a game" />
        </PageMessage>
      );
    case 'not_found':
      return (
        <PageMessage size="compact" title="Game" back={exit}>
          <NotAvailable title="This game is not available">There is no game you can open at this address.</NotAvailable>
        </PageMessage>
      );
    case 'preparing':
      return (
        <PageMessage size="compact" title={data.name} back={exit}>
          <LoadPending title="Preparing the table">
            The game is being set up. This page opens the table as soon as it is ready.
          </LoadPending>
        </PageMessage>
      );
    case 'unavailable':
      return (
        <PageMessage size="compact" title={data.name} back={exit}>
          <NotAvailable title="This game could not be prepared">
            {data.reason ?? 'The table was not ready in time. Create the game again from the lobby.'}
          </NotAvailable>
        </PageMessage>
      );
    case 'ready':
      return <TablePage title={data.name} gameId={data.gameId} exit={exit} />;
  }
}

const noSubscription = () => () => {};
type KnownGame = Pick<
  Extract<NonNullable<ReturnType<typeof useGameAccess>['data']>, { gameId: string }>,
  'gameId' | 'slug' | 'name' | 'status'
>;
type GamePageEvent = { type: 'resolved'; game: KnownGame };

/* One element for a ready game and for a kept table, so the table a reload restored stays mounted when the directory answers. */
function TablePage({ title, gameId, exit }: Readonly<{ title: string; gameId: string; exit: ReactNode }>) {
  const loading = <TableWait status="Loading the table...">{exit}</TableWait>;
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header size="compact">
        <PageTitle title={title} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={loading}>
          <Suspense fallback={loading}>
            <HostedTable key={gameId} gameId={gameId} exitControl={exit} />
          </Suspense>
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}

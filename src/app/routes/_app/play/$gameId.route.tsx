import { Button } from '@mantine/core';
import { ClientOnly, createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense, useEffect } from 'react';

import { useGameAccess } from '@db/play';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { TableWait } from './TableWait';

const loadHostedTable = () => import('./multiplayer/HostedTable');
const HostedTable = lazy(loadHostedTable);

/*
 * The retired Demo and Hosted pages (#1296) lived at these addresses. Old links and bookmarks land in the
 * lobby rather than on a game page that asks to sign in for a game that never existed.
 */
const RETIRED_PAGES: ReadonlySet<string> = new Set(['demo', 'hosted']);

/*
 * PROTOTYPE, #1323: `?variant=a|b|c` picks what a signed-in player sees at the hosted fixture's address.
 * A is today's table, B answers the fixture as the directory answers an unknown id, C sends it to the lobby as #1459 sends /play/hosted.
 */
const FIXTURE_ADMISSION_VARIANTS = ['a', 'b', 'c'] as const;
type FixtureAdmissionVariant = (typeof FIXTURE_ADMISSION_VARIANTS)[number];
const isFixtureAdmissionVariant = (value: unknown): value is FixtureAdmissionVariant =>
  FIXTURE_ADMISSION_VARIANTS.some((variant) => variant === value);

/* PROTOTYPE, #1323: Storybook's router mock records `<Navigate>` instead of following it, so the prototype navigates itself. */
function LobbyRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: '/play', replace: true });
  }, [navigate]);
  return null;
}

export const Route = createFileRoute('/_app/play/$gameId')({
  validateSearch: (params: Record<string, unknown>): { variant?: FixtureAdmissionVariant } =>
    isFixtureAdmissionVariant(params.variant) ? { variant: params.variant } : {},
  beforeLoad: ({ params }) => {
    if (RETIRED_PAGES.has(params.gameId)) {
      throw redirect({ to: '/play', replace: true });
    }
  },
  /* Starts the table bundle with the route, and on an intent preload, so the frame never waits for it after the directory answers. */
  loader: () => {
    void loadHostedTable();
  },
  head: () => ({ meta: [{ title: 'Game | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
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
  const { gameId } = Route.useParams();
  const { variant } = Route.useSearch();
  const { data: answer } = useGameAccess(gameId);
  /* PROTOTYPE, #1323: the hosted fixture is the one ready game without a ruleset. */
  const fixture = answer?.status === 'ready' && answer.ruleset === null;
  if (fixture && variant === 'c') {
    return <LobbyRedirect />;
  }
  const data = fixture && variant === 'b' ? { status: 'not_found' as const } : answer;
  const exit = (
    <Button component={Link} to="/play" variant="default" aria-label="Back to lobby">
      Lobby
    </Button>
  );
  switch (data?.status) {
    case undefined:
      return (
        <PageLayout height="fullscreen">
          <PageLayout.Header size="compact">
            <PageTitle title="Game" />
          </PageLayout.Header>
          <PageLayout.Content width="viewport">
            <TableWait status="Loading the game...">{exit}</TableWait>
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
        <PageMessage size="compact" title="Game" back={exit}>
          <LoadPending title="Preparing the table">
            The game is being set up. This page opens the table as soon as it is ready.
          </LoadPending>
        </PageMessage>
      );
    case 'unavailable':
      return (
        <PageMessage size="compact" title="Game" back={exit}>
          <NotAvailable title="This game could not be prepared">
            {data.reason ?? 'The table was not ready in time. Create the game again from the lobby.'}
          </NotAvailable>
        </PageMessage>
      );
    case 'ready': {
      const loading = <TableWait status="Loading the table...">{exit}</TableWait>;
      return (
        <PageLayout height="fullscreen">
          <PageLayout.Header size="compact">
            <PageTitle title={data.name} />
          </PageLayout.Header>
          <PageLayout.Content width="viewport">
            <ClientOnly fallback={loading}>
              <Suspense fallback={loading}>
                <HostedTable key={data.gameId} gameId={data.gameId} exitControl={exit} />
              </Suspense>
            </ClientOnly>
          </PageLayout.Content>
        </PageLayout>
      );
    }
  }
}

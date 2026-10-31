import { PLAY_SEAT_LIMIT_MESSAGE } from '@shared/play/seatLimit';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { PageLayout } from '@ui/layout/PageLayout';
import { useEffect, useReducer, useRef, useState } from 'react';
import type { Dispatch } from 'react';

import { useCreatableRulesets, useCreateGame, usePlayReadiness } from '@db/play';
import { pageHead } from '@app/routes/pageTitle';
import {
  CreateGamePass,
  CreateGamePassTitle,
  createGameDraftReducer,
  initialCreateGameDraft,
} from '@app/widgets/create-game/CreateGamePass';
import type { CreateGameDraftEvent, CreateGameRequest, PassRuleset } from '@app/widgets/create-game/CreateGamePass';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import {
  SERVER_RETRYING,
  SERVER_UNREACHABLE,
  SERVER_UNREACHABLE_TITLE,
  useServerUnreachable,
} from './useServerUnreachable';

export const Route = createFileRoute('/_app/play/create')({
  head: () => pageHead('Create a game', { noindex: true }),
  component: CreateGamePage,
});

const TITLE = 'Create a game';
/* As long as the fade to the table's ground in the pass's stylesheet takes. */
const DEPARTURE_MS = 700;

const REFUSALS = {
  not_authorized: 'Your account cannot create a game while signed out, suspended or deleted.',
  rate_limited: 'Too many games were created recently. Try again later.',
  seat_limit: PLAY_SEAT_LIMIT_MESSAGE,
  unavailable: 'That ruleset cannot start a game right now.',
  invalid_name: 'Choose a game name with 1 to 80 characters and at least one Latin letter or number.',
  profanity_detected: 'Choose a game name without profanity. Your other choices are still here.',
} as const;

/** The create page: it reads the rulesets the player may start a game with, and creates the game the pass describes. */
function CreateGamePage() {
  /* The draft lives here so the page's one query can carry the chosen ruleset and answer with its manifest. */
  const [draft, dispatch] = useReducer(createGameDraftReducer, undefined, initialCreateGameDraft);
  const { data } = useCreatableRulesets(draft.rulesetId);
  const unreachable = useServerUnreachable(data === undefined);
  switch (data?.access) {
    case undefined:
      return (
        <PageMessage size="compact" title={TITLE} back={<PageMessage.Back to="/">Go back home</PageMessage.Back>}>
          {unreachable ? (
            <LoadPending title={SERVER_UNREACHABLE_TITLE}>{SERVER_RETRYING}</LoadPending>
          ) : (
            <LoadPending title="Loading rulesets">
              The rulesets you can start a game with are still loading.
            </LoadPending>
          )}
        </PageMessage>
      );
    case 'unauthenticated':
      return (
        <PageMessage size="compact" title={TITLE}>
          <LoginGate action="create a game" />
        </PageMessage>
      );
    case 'allowed':
      return (
        <CreateGameForm
          rulesets={data.rulesets}
          preview={data.preview?.rulesetId === draft.rulesetId ? data.preview : null}
          draft={draft}
          dispatch={dispatch}
        />
      );
  }
}

type CreateGame = ReturnType<typeof useCreateGame>;

/* Pressing Create game fades the page to the table's ground; the game opens once the fade is complete, and a refusal lifts it again. */
function useDeparture(createGame: CreateGame, dispatch: Dispatch<CreateGameDraftEvent>) {
  const navigate = useNavigate();
  const [departing, setDeparting] = useState(false);
  const departedAt = useRef(0);
  const opening = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(opening.current), []);
  /* Convex holds a mutation while it cannot reach the server, so a fade with no answer lifts again and the page says why. */
  const stalled = useServerUnreachable(departing && createGame.isPending);
  const depart = (input: CreateGameRequest) => {
    departedAt.current = performance.now();
    setDeparting(true);
    createGame.mutate(input, {
      onSuccess: (result) => {
        if (result.ok) {
          const remaining = Math.max(0, DEPARTURE_MS - (performance.now() - departedAt.current));
          opening.current = setTimeout(
            () => void navigate({ to: '/play/$gameId', params: { gameId: result.slug ?? result.gameId } }),
            remaining
          );
        } else {
          setDeparting(false);
          dispatch({ kind: 'refused', reason: REFUSALS[result.reason] });
        }
      },
      onError: () => setDeparting(false),
    });
  };
  return { departing, stalled, depart };
}

const NO_FACTIONS: [] = [];

/**
 * The rulesets with the chosen one judged as the game will judge it at creation, so a ruleset whose decks or bundles the table cannot take is refused here rather than after Create game.
 * The listing's own objection stands first;
 * the capture's first ruleset problem fills in for it.
 */
function useCheckedRulesets(rulesets: readonly PassRuleset[], rulesetId: string, revision: string) {
  const chosen = rulesets.find((ruleset) => ruleset.id === rulesetId);
  const checkable = chosen?.selectable && chosen.objection === null ? chosen : undefined;
  const { check } = usePlayReadiness(
    checkable ? { id: checkable.id, name: checkable.name } : null,
    NO_FACTIONS,
    revision
  );
  if (!checkable) {
    return { rulesets, rulesetCheck: 'ready' as const };
  }
  /* A verdict still naming the ruleset chosen before is as good as none yet. */
  const verdict = check.status === 'checked' && check.entries[0]?.id === checkable.id ? check.entries[0] : null;
  const problem = verdict?.problems[0];
  const objection = problem ? `${problem.subject}: ${problem.reason}` : null;
  return {
    rulesets: objection
      ? rulesets.map((ruleset) => (ruleset.id === checkable.id ? { ...ruleset, objection } : ruleset))
      : rulesets,
    /* A check that could not finish does not hold the pass, and says so: the table still checks when it prepares. */
    rulesetCheck: verdict
      ? ('ready' as const)
      : check.status === 'failed'
        ? ('unknown' as const)
        : ('checking' as const),
  };
}

/* The ruleset page, which the pass opens in a new tab. */
const rulesetLink = (slug: string) => (rootProps: object) => (
  <Link {...rootProps} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: slug }} />
);

/* The pass, creating the game through Convex and opening its table once the fade is complete. */
function CreateGameForm({
  dispatch,
  ...pass
}: Readonly<
  Omit<
    Parameters<typeof CreateGamePass>[0],
    'pending' | 'departing' | 'notice' | 'failure' | 'onCreate' | 'rulesetLink' | 'rulesetCheck'
  >
>) {
  const createGame = useCreateGame();
  const { departing, stalled, depart } = useDeparture(createGame, dispatch);
  /* The live manifest changes as the ruleset's decks and bundles do, so a fix made in another tab is checked again. */
  const { rulesets, rulesetCheck } = useCheckedRulesets(
    pass.rulesets,
    pass.draft.rulesetId,
    JSON.stringify(pass.preview?.packed ?? null)
  );
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <CreateGamePassTitle />
      </PageLayout.Header>
      <PageLayout.Content>
        <CreateGamePass
          {...pass}
          rulesets={rulesets}
          rulesetCheck={rulesetCheck}
          dispatch={dispatch}
          pending={createGame.isPending}
          /* A stalled request lifts the fade, so the page can say why. */
          departing={departing && !stalled}
          notice={stalled ? SERVER_UNREACHABLE : departing ? 'Opening the table...' : null}
          failure={createGame.error ? 'The game could not be created. Try again.' : null}
          onCreate={depart}
          rulesetLink={rulesetLink}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}

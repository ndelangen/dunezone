import { Button, NumberInput, Select, Stack, Text } from '@mantine/core';
import { playCreateGameRequestSchema } from '@shared/play/admission';
import { PLAY_SEAT_LIMIT_MESSAGE } from '@shared/play/participation';
import { TABLE_SEAT_COUNTS } from '@shared/play/tableSettings';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useReducer } from 'react';

import { useCreatableRulesets, useCreateGame } from '@db/play';
import type { CreatableRuleset } from '@db/play';
import { pageHead } from '@app/routes/pageTitle';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { SERVER_RETRYING, SERVER_UNREACHABLE_TITLE, useServerUnreachable } from './useServerUnreachable';

export const Route = createFileRoute('/_app/play/create')({
  head: () => pageHead('Create a game', { noindex: true }),
  component: CreateGamePage,
});

const TITLE = 'Create a game';
const MINIMUM = TABLE_SEAT_COUNTS[0];
const MAXIMUM = TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]!;
const EMPTY_DRAFT = { rulesetId: '', minimumPlayers: 6 as number | string, refusal: null as string | null };
type Draft = typeof EMPTY_DRAFT;
type DraftEvent = { kind: 'patch'; update: Partial<Draft> } | { kind: 'refused'; reason: string };

/* One draft, one reducer: a field change and a refusal from the server are the two events. */
function draftReducer(state: Draft, event: DraftEvent): Draft {
  switch (event.kind) {
    case 'patch':
      return { ...state, ...event.update, refusal: null };
    case 'refused':
      return { ...state, refusal: event.reason };
  }
}

const REFUSALS = {
  not_authorized: 'Your account cannot create a game while signed out, suspended or deleted.',
  rate_limited: 'Too many games were created recently. Try again later.',
  seat_limit: PLAY_SEAT_LIMIT_MESSAGE,
  unavailable: 'That ruleset cannot start a game right now.',
} as const;

function CreateGamePage() {
  const { data } = useCreatableRulesets();
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
      return <CreateGameForm rulesets={data.rulesets} />;
  }
}

function CreateGameForm({ rulesets }: Readonly<{ rulesets: CreatableRuleset[] }>) {
  const navigate = useNavigate();
  const createGame = useCreateGame();
  const [draft, dispatch] = useReducer(draftReducer, EMPTY_DRAFT);
  const chosen = rulesets.find((ruleset) => ruleset.id === draft.rulesetId);
  const request = playCreateGameRequestSchema.safeParse({
    rulesetId: draft.rulesetId,
    minimumPlayers: draft.minimumPlayers,
  });
  const objection = chosen?.objection ?? null;
  const canCreate = request.success && chosen !== undefined && objection === null && !createGame.isPending;
  const submit = () => {
    if (request.success) {
      createGame.mutate(request.data, {
        onSuccess: (result) =>
          result.ok
            ? navigate({ to: '/play/$gameId', params: { gameId: result.gameId } })
            : dispatch({ kind: 'refused', reason: REFUSALS[result.reason] }),
      });
    }
  };
  const failure = draft.refusal ?? (createGame.error ? 'The game could not be created. Try again.' : null);

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title={TITLE} />
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="lg">
          <Stack gap="md" maw={520}>
            <Text>
              A game plays one ruleset, fixed at creation, and opens drafting at once with you in the first seat. The
              minimum number of players is the number of seats at its table; everyone else who enters watches until
              drafting seats them.
            </Text>
            <Select
              label="Ruleset"
              placeholder="Choose a ruleset"
              data={rulesets.map((ruleset) => ({ value: ruleset.id, label: ruleset.name }))}
              value={draft.rulesetId || null}
              onChange={(value) => dispatch({ kind: 'patch', update: { rulesetId: value ?? '' } })}
              searchable
              nothingFoundMessage="No ruleset matches"
            />
            {chosen ? (
              <Text size="sm" c={objection ? 'red' : 'dimmed'} role="status">
                {objection ?? 'Both required decks are linked. The table checks every card and back when it prepares.'}
              </Text>
            ) : null}
            <NumberInput
              label="Minimum players"
              description={`From ${MINIMUM} to ${MAXIMUM} seats at the table.`}
              min={MINIMUM}
              max={MAXIMUM}
              step={1}
              value={draft.minimumPlayers}
              onChange={(value) => dispatch({ kind: 'patch', update: { minimumPlayers: value } })}
            />
            {failure ? <FormError title="Not created">{failure}</FormError> : null}
            <Button onClick={submit} disabled={!canCreate} loading={createGame.isPending}>
              Create game
            </Button>
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

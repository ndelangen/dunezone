import { Button, NumberInput, Select, Stack, Text } from '@mantine/core';
import { playCreateGameRequestSchema } from '@shared/play/admission';
import { TABLE_SEAT_COUNTS } from '@shared/play/tableSettings';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useReducer } from 'react';

import { useCreatableRulesets, useCreateGame } from '@db/play';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/play/create')({
  head: () => ({ meta: [{ title: 'Create a game | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: CreateGamePage,
});

const TITLE = 'Create a game';
const MINIMUM = TABLE_SEAT_COUNTS[0];
const MAXIMUM = TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]!;
const EMPTY_DRAFT = { rulesetId: '', minimumPlayers: 6 as number | string, refusal: null as string | null };

function CreateGamePage() {
  const { data } = useCreatableRulesets();
  if (data === undefined) {
    return (
      <PageMessage size="compact" title={TITLE}>
        <LoadPending title="Loading rulesets">The rulesets you can start a game with are still loading.</LoadPending>
      </PageMessage>
    );
  }
  if (data.access === 'unauthenticated') {
    return (
      <PageMessage size="compact" title={TITLE}>
        <LoginGate action="create a game" />
      </PageMessage>
    );
  }
  if (data.access === 'not_authorized') {
    return (
      <PageMessage size="compact" title={TITLE}>
        <NotAvailable title="You cannot create a game yet">
          Creating a game is limited to Administrators while real games are being delivered.
        </NotAvailable>
      </PageMessage>
    );
  }
  return <CreateGameForm rulesets={data.rulesets} />;
}

type Choice = { id: string; slug: string; name: string; objection: string | null };

function CreateGameForm({ rulesets }: Readonly<{ rulesets: Choice[] }>) {
  const navigate = useNavigate();
  const createGame = useCreateGame();
  /* One draft, one reducer: a field change and a refusal from the server are the two events. */
  const [draft, dispatch] = useReducer(
    (
      state: typeof EMPTY_DRAFT,
      event: { kind: 'patch'; update: Partial<typeof EMPTY_DRAFT> } | { kind: 'refused'; reason: string }
    ) =>
      event.kind === 'refused' ? { ...state, refusal: event.reason } : { ...state, ...event.update, refusal: null },
    EMPTY_DRAFT
  );
  const chosen = rulesets.find((ruleset) => ruleset.id === draft.rulesetId);
  const request = playCreateGameRequestSchema.safeParse({
    rulesetId: draft.rulesetId,
    minimumPlayers: draft.minimumPlayers,
  });
  const objection = chosen?.objection ?? null;
  const canCreate = request.success && chosen !== undefined && objection === null && !createGame.isPending;
  const submit = () => {
    if (!request.success) {
      return;
    }
    createGame.mutate(request.data, {
      onSuccess: (result) => {
        if (result.ok) {
          navigate({ to: '/play/$gameId', params: { gameId: result.gameId } });
        } else {
          dispatch({
            kind: 'refused',
            reason:
              result.reason === 'not_authorized'
                ? 'Your account may not create a game.'
                : 'That ruleset cannot start a game right now.',
          });
        }
      },
    });
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
              A game plays one ruleset, fixed at creation, and starts drafting once its minimum number of players have
              taken seats. You take the first seat.
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
              description={`From ${MINIMUM} to ${MAXIMUM}. More may join while drafting.`}
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

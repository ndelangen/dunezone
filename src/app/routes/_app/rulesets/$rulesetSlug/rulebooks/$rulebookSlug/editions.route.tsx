import { Box, Group, Stack, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { PageIdentity } from '@ui/block/PageIdentity';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { formatStableDate } from '@ui/content/dates';
import { EditionArtifactLink } from '@ui/content/EditionArtifactLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import { loadRulebookEditionHistory, useRulebookEditionHistory } from '@db/rulebooks';
import { redirectFromFormerAddress } from '@app/routes/formerAddress';
import { pageHead } from '@app/routes/pageTitle';
import { RouteLoadError, RouteNotFound } from '@app/routes/routeStates';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/editions')({
  loader: async ({ params, location }) => {
    const history = await loadRulebookEditionHistory(params);
    if (!history) {
      await redirectFromFormerAddress(
        { kind: 'rulebook', ruleset_slug: params.rulesetSlug, rulebook_slug: params.rulebookSlug },
        location,
        '/editions'
      );
    }
    return history;
  },
  head: ({ loaderData }) => pageHead(loaderData ? `Editions of ${loaderData.rulebook.name}` : 'Editions'),
  errorComponent: RulebookEditionHistoryError,
  pendingComponent: () => (
    <RoutePending title="Editions" loading="Loading Editions">
      Loading the Edition history.
    </RoutePending>
  ),
  component: RulebookEditionHistoryPage,
});

function RulebookEditionHistoryError({ error }: ErrorComponentProps) {
  const params = Route.useParams();
  return (
    <RouteLoadError
      title="Editions"
      back={
        <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug: params.rulesetSlug }}>
          Back to ruleset
        </PageMessage.Back>
      }
      what="Editions could not be loaded"
      error={error}
    />
  );
}

function RulebookEditionHistoryPage() {
  const params = Route.useParams();
  const initialData = Route.useLoaderData();
  const { data } = useRulebookEditionHistory({ ...params, initialData });
  if (!data) {
    return (
      <RouteNotFound
        title="Editions"
        back={
          <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug: params.rulesetSlug }}>
            Back to ruleset
          </PageMessage.Back>
        }
        noun="Rulebook"
      />
    );
  }
  const currentNumber = data.rulebook.current_edition_number;
  const currentEdition = data.editions.find((edition) => edition.edition_number === currentNumber);
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageIdentity
          title={data.rulebook.name}
          breadcrumb={
            <Breadcrumb to="/rulesets/$rulesetSlug" params={{ rulesetSlug: data.ruleset.slug }}>
              {data.ruleset.name}
            </Breadcrumb>
          }
        >
          <Text size="sm">{editionsSummary(data.editions.length, currentEdition)}</Text>
        </PageIdentity>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="md" role="list" aria-label="Editions">
          {data.editions.map((edition) => {
            const current = edition.edition_number === currentNumber;
            return (
              <Box key={edition.edition_number} role="listitem">
                <Surface padding="md">
                  <Group justify="space-between" wrap="wrap" gap="sm">
                    <Stack gap="xs">
                      <Group gap="xs">
                        <Text fw={600}>Edition {edition.edition_number}</Text>
                        {current ? <StatusBadge tone="positive">Current</StatusBadge> : null}
                      </Group>
                      <Text size="sm" c="dimmed">
                        Published <time dateTime={edition.created_at}>{formatStableDate(edition.created_at)}</time>
                      </Text>
                    </Stack>
                    <Group gap="xs" wrap="wrap">
                      <EditionArtifactLink kind="html" artifact={edition.html} size="sm" />
                      <EditionArtifactLink kind="pdf" artifact={edition.pdf} size="sm" />
                      <IconAction
                        label={`Read Edition ${edition.edition_number}`}
                        tooltip={`Read Edition ${edition.edition_number}`}
                        emphasis="standard"
                        intent="neutral"
                        size="sm"
                        icon={<BookOpen size={15} aria-hidden />}
                        renderRoot={(props) => (
                          <Link
                            {...props}
                            to="/rulesets/$rulesetSlug/rulebooks/$rulebookSlug"
                            params={{ rulesetSlug: params.rulesetSlug, rulebookSlug: params.rulebookSlug }}
                            search={current ? {} : { edition: edition.edition_number }}
                          />
                        )}
                      />
                    </Group>
                  </Group>
                </Surface>
              </Box>
            );
          })}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** The band's one line about the history, in words: how many editions, and which one is current and since when. */
function editionsSummary(
  count: number,
  current: { edition_number: number; created_at: string } | undefined
): ReactNode {
  const total = count === 1 ? '1 Edition' : `${count} Editions`;
  return current ? (
    <>
      {total} · current: Edition {current.edition_number},{' '}
      <time dateTime={current.created_at}>{formatStableDate(current.created_at)}</time>
    </>
  ) : (
    total
  );
}

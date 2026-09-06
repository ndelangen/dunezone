import { Box, Group, Stack, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { formatStableDate } from '@ui/content/dates';
import { EditionArtifactLink } from '@ui/content/EditionArtifactLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, BookOpen } from 'lucide-react';

import { loadRulebookEditionHistory, useRulebookEditionHistory } from '@db/rulebooks';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/editions')({
  loader: ({ params }) => loadRulebookEditionHistory(params),
  head: ({ loaderData }) => ({
    meta: [{ title: `Editions of ${loaderData?.rulebook.name ?? 'Rulebook'} | Dune Zone` }],
  }),
  errorComponent: RulebookEditionHistoryError,
  pendingComponent: () => (
    <PageMessage title="Editions">
      <LoadPending title="Loading Editions">Loading the Edition history.</LoadPending>
    </PageMessage>
  ),
  component: RulebookEditionHistoryPage,
});

function RulebookEditionHistoryError({ error }: ErrorComponentProps) {
  const params = Route.useParams();
  return (
    <PageMessage
      title="Editions"
      back={
        <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug: params.rulesetSlug }}>
          Back to ruleset
        </PageMessage.Back>
      }
    >
      <LoadError title="Editions could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

function RulebookEditionHistoryPage() {
  const params = Route.useParams();
  const initialData = Route.useLoaderData();
  const { data } = useRulebookEditionHistory({ ...params, initialData });
  if (!data) {
    return (
      <PageMessage
        title="Editions"
        back={
          <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug: params.rulesetSlug }}>
            Back to ruleset
          </PageMessage.Back>
        }
      >
        <NotAvailable title="Rulebook not found">This Rulebook does not exist or was deleted.</NotAvailable>
      </PageMessage>
    );
  }
  const currentNumber = data.rulebook.current_edition_number;
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle
          title={data.rulebook.name}
          eyebrow={data.editions.length === 1 ? '1 Edition' : `${data.editions.length} Editions`}
        />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="sm" wrap="wrap">
              <IconAction
                label="Back to ruleset"
                emphasis="standard"
                intent="neutral"
                icon={<ArrowLeft size={18} aria-hidden />}
                renderRoot={(props) => (
                  <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: params.rulesetSlug }} />
                )}
              />
            </Group>
          </Toolbar.Left>
        </Toolbar>
      </PageLayout.Toolbar>
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

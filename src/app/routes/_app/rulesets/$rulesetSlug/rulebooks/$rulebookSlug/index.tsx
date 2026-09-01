import { Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { formatRelativeDate } from '@ui/content/dates';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft } from 'lucide-react';

import { loadRulebookReader, useRulebookReader } from '@db/rulebooks';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { projectRulebookRenderDocument } from '@app/print/rulebook/projectRulebookRenderDocument';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RulebookDocumentRenderer } from '@game/rulebook/RulebookRenderer';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/')({
  loader: ({ params }) => loadRulebookReader(params),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.rulebook.name ?? 'Rulebook'} | Dune Zone` }] }),
  pendingComponent: () => (
    <PageMessage title="Rulebook">
      <LoadPending title="Loading Rulebook">Loading the current Edition.</LoadPending>
    </PageMessage>
  ),
  errorComponent: RulebookReaderError,
  component: RulebookReaderPage,
});

function RulebookReaderError({ error }: ErrorComponentProps) {
  const { rulesetSlug } = Route.useParams();
  return (
    <PageMessage
      title="Rulebook"
      back={
        <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
          Back to ruleset
        </PageMessage.Back>
      }
    >
      <LoadError title="Rulebook could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

function RulebookReaderPage() {
  const params = Route.useParams();
  const initialData = Route.useLoaderData();
  const { data } = useRulebookReader({ ...params, initialData });
  if (!data) {
    return (
      <PageMessage
        title="Rulebook"
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
  const document = projectRulebookRenderDocument(data.edition.contents, data.assetsById);
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title={data.rulebook.name} eyebrow={`Edition ${data.edition.edition_number}`} />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <IconAction
              label="Back to ruleset"
              variant="light"
              color="gray"
              icon={<ArrowLeft size={18} aria-hidden />}
              renderRoot={(props) => (
                <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: params.rulesetSlug }} />
              )}
            />
          </Toolbar.Left>
          <Toolbar.Right>
            <Text size="sm" c="dimmed">
              Updated{' '}
              <time dateTime={data.edition.created_at} title={new Date(data.edition.created_at).toLocaleString()}>
                {formatRelativeDate(data.edition.created_at)}
              </time>
            </Text>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <RulebookDocumentRenderer document={document} as="section" label={`${data.rulebook.name} contents`} />
      </PageLayout.Content>
    </PageLayout>
  );
}

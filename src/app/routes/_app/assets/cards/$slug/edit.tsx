import { Alert, Anchor, Stack, Text, Title } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useState } from 'react';

import { loadAssetForEdit, useAssetForEdit, useUpdateAsset } from '@app/db/assets';
import type { AssetForEditData } from '@app/db/assets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { TreacheryCardEditor, treacheryDraftWarnings } from '@app/widgets/card-editor/TreacheryCardEditor';
import type { TreacheryChapter, TreacheryDraft } from '@app/widgets/card-editor/TreacheryCardEditor';
import { Treachery } from '@game/data/objects';

export const Route = createFileRoute('/_app/assets/cards/$slug/edit')({
  loader: async ({ params }) => await loadAssetForEdit('cards', params.slug),
  component: EditTreacheryCardPage,
});

const VALIDATION_HEADER_ID = 'card-validation-header';

function MessagePage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack gap={2} align="center">
          <Title order={1}>{title}</Title>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          <Stack gap="sm">
            {children}
            <Anchor
              renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$category" params={{ category: 'cards' }} />}
            >
              Back to cards
            </Anchor>
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

function EditTreacheryCardPage() {
  const { slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const query = useAssetForEdit('cards', slug, { initialData: loaderData });
  const data = query.data ?? loaderData;

  if (data === null) {
    return (
      <MessagePage title="Card not found">
        <Text>No treachery card lives at this address.</Text>
      </MessagePage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <MessagePage title={`Edit ${data.asset.name}`}>
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to edit cards.
        </Text>
      </MessagePage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <MessagePage title={`Edit ${data.asset.name}`}>
        <Text>
          {data.viewerAccess.assignedGroup
            ? 'Only the card owner or an active member of its group can edit this card.'
            : 'Only the card owner can edit this card.'}
        </Text>
      </MessagePage>
    );
  }

  const parsed = Treachery.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <MessagePage title={`Edit ${data.asset.name}`}>
        <Text>This card's stored data no longer matches the treachery card schema, so it cannot be edited here.</Text>
      </MessagePage>
    );
  }

  return <CardEditSession key={data.asset.id} asset={data.asset} initialDraft={parsed.data} />;
}

function CardEditSession({
  asset,
  initialDraft,
}: {
  asset: NonNullable<AssetForEditData>['asset'];
  initialDraft: TreacheryDraft;
}) {
  const navigate = useNavigate();
  const updateAsset = useUpdateAsset();
  const [draft, setDraft] = useState<TreacheryDraft>(initialDraft);
  const [baseline, setBaseline] = useState<TreacheryDraft>(initialDraft);
  const [chapter, setChapter] = useState<TreacheryChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const patch = (update: Partial<TreacheryDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = treacheryDraftWarnings(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const isNameBlank = !draft.name.trim();
  const saveState: AuthoringSaveState = updateAsset.isPending
    ? 'saving'
    : updateAsset.error
      ? 'error'
      : updateAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const validationHeaderOpen = useValidationHeaderOpen(warnings.length, settleTick);

  const save = () => {
    const saved = draft;
    updateAsset.mutate(
      { id: asset.id, data: saved },
      {
        onSuccess: ({ slug: nextSlug }) => {
          setBaseline(saved);
          /* Renames re-slug: follow the card to its new URL so a reload keeps editing it. */
          if (nextSlug !== asset.slug) {
            void navigate({ to: '/assets/cards/$slug/edit', params: { slug: nextSlug }, replace: true });
          }
        },
      }
    );
  };

  return (
    <PageLayout>
      {validationHeaderOpen ? (
        <PageLayout.Header size="compact">
          <ValidationHeader
            id={VALIDATION_HEADER_ID}
            warnings={warnings}
            onFocusWarning={(warning) => setChapter(warning.chapter)}
          />
        </PageLayout.Header>
      ) : null}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{ isDirty, isNameBlank, warningCount: warnings.length, saveState }}
          copy={{
            saveLabel: 'Save card',
            nameBlankMessage: 'Add a card name before saving; it determines the card URL.',
            statusMessage:
              saveState === 'error'
                ? 'The card was not saved.'
                : saveState === 'saved'
                  ? 'Saved. Publication follows once the image pipeline supports cards.'
                  : 'Changes stay local until you explicitly save them.',
          }}
          actions={{
            onSave: save,
            onReviewWarnings: () =>
              document.getElementById(VALIDATION_HEADER_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            onReset: () => setDraft(baseline),
            onBack: () => void navigate({ to: '/assets/$category', params: { category: 'cards' } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="sm" style={{ width: '100%', maxWidth: '78rem', margin: '0 auto' }}>
          {updateAsset.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not save">
              {updateAsset.error.message}
            </Alert>
          ) : null}
          <TreacheryCardEditor
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

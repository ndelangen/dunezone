import { Anchor, Center, Group, Image, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { rulesetDescriptionSchema } from '@shared/rulesets/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { rulesetDescriptionHint } from '@ui/content/rulesetDescriptionHint';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { IconAction } from '@ui/control/IconAction';
import { SubmitAction } from '@ui/control/SubmitAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useState } from 'react';

import { loadRulesetDetailPage, useRulesetDetailPage, useUpdateRuleset } from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';

import styles from './edit.module.css';

function RulesetSettings({ initial, canRename }: { initial: RulesetEntry; canRename: boolean }) {
  const navigate = useNavigate();
  const updateRuleset = useUpdateRuleset();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [coverUrl, setCoverUrl] = useState(initial.image_cover ?? '');

  const mutationError =
    updateRuleset.isError && updateRuleset.error instanceof Error ? updateRuleset.error.message : null;
  const descriptionCheck = rulesetDescriptionSchema.safeParse(description);
  /**
   * The floor applies to every save, with no exemption for rows that predate the field — so a ruleset still carrying the backfilled empty string cannot be saved until someone writes a description.
   * Shown as an error only once something has been typed;
   * an untouched empty field is explained by the requirement line and the disabled button instead.
   */
  const descriptionError =
    description.trim().length > 0 && !descriptionCheck.success ? descriptionCheck.error.issues[0]?.message : undefined;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || !descriptionCheck.success) {
      return;
    }
    const trimmedCover = coverUrl.trim();
    const previousSlug = initial.slug;
    try {
      const entry = await updateRuleset.mutateAsync({
        id: initial._id,
        input: { name: nextName, description: descriptionCheck.data },
        imageCover: trimmedCover === '' ? null : trimmedCover,
      });
      if (previousSlug !== entry.slug) {
        navigate({
          to: '/rulesets/$rulesetSlug/edit',
          params: { rulesetSlug: entry.slug },
          replace: true,
        });
      }
    } catch {
      /* surfaced through mutationError */
    }
  };

  return (
    <Stack component="form" gap="md" onSubmit={handleSubmit}>
      <TextInput
        id="ruleset-settings-name"
        name="name"
        label="Name"
        description={
          canRename ? (
            <SlugRenameNotice noun="ruleset" url={`…/rulesets/${initial.slug}`} />
          ) : (
            'Only the ruleset owner can rename it.'
          )
        }
        required
        minLength={1}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        disabled={!canRename}
      />

      <Textarea
        id="ruleset-settings-description"
        name="description"
        label="Description"
        description={rulesetDescriptionHint(description)}
        error={descriptionError}
        required
        autosize
        minRows={4}
        value={description}
        onChange={(event) => setDescription(event.currentTarget.value)}
      />

      <TextInput
        id="ruleset-settings-cover"
        type="url"
        label="Cover image URL"
        description={
          <>
            Optional. Use a full <code>https://</code> URL. Leave empty to clear the cover.
          </>
        }
        value={coverUrl}
        onChange={(event) => setCoverUrl(event.currentTarget.value)}
        placeholder="https://…"
        autoComplete="off"
      />

      {mutationError ? <FormError title="Ruleset could not be saved">{mutationError}</FormError> : null}

      <Group justify="flex-end">
        <SubmitAction
          pending={updateRuleset.isPending}
          disabled={name.trim().length === 0 || !descriptionCheck.success}
        >
          Save changes
        </SubmitAction>
      </Group>
    </Stack>
  );
}

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/edit')({
  loader: async ({ params }) => {
    const detailPage = await loadRulesetDetailPage(params.rulesetSlug);
    if (!detailPage) {
      return { notFound: true as const };
    }
    return { notFound: false as const, detailPage };
  },
  component: RulesetEditPage,
});

function RulesetEditPage() {
  const { rulesetSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const detailSeed = !loaderData.notFound && loaderData.detailPage ? loaderData.detailPage : undefined;
  const pageQuery = useRulesetDetailPage(rulesetSlug, { initialData: detailSeed });
  const page = pageQuery.data;

  const header = page?.ruleset ? (
    <Group wrap="nowrap" align="center" gap="lg" className={styles.pageHead}>
      <Surface>
        {page?.ruleset.image_cover ? (
          <Image
            src={page?.ruleset.image_cover}
            fallbackSrc="/image/background/card-large.jpg"
            alt={`Cover for ${page?.ruleset.name}`}
            className={styles.coverImage}
          />
        ) : (
          <Center h="100%">
            <Text size="xs" c="dimmed" ta="center">
              No cover
            </Text>
          </Center>
        )}
      </Surface>
      <Stack gap={6} className={styles.pageHeadText}>
        <Title order={1} className={styles.rulesetTitle}>
          Edit {page?.ruleset.name}
        </Title>
      </Stack>
    </Group>
  ) : (
    <Title order={1}>Edit ruleset</Title>
  );
  const toolbar = (
    <Surface padding="sm">
      <Group gap="xs" wrap="wrap" role="group" aria-label="Ruleset navigation">
        <IconAction
          label="Back to rulesets"
          variant="light"
          color="gray"
          size="lg"
          renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
          icon={<ArrowLeft size={17} aria-hidden />}
        />
        {page?.ruleset ? (
          <IconAction
            label="View ruleset"
            variant="light"
            color="dune"
            size="lg"
            renderRoot={(rootProps) => (
              <Link
                {...rootProps}
                to="/rulesets/$rulesetSlug"
                params={{ rulesetSlug: page?.ruleset?.slug ?? rulesetSlug }}
              />
            )}
            icon={<BookOpen size={17} aria-hidden />}
          />
        ) : null}
      </Group>
    </Surface>
  );

  if (loaderData.notFound) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>Ruleset not found.</Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (!page?.ruleset) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>Ruleset not found.</Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  const r = page.ruleset;
  const viewerAccess = page.viewerAccess;

  if (!viewerAccess) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>Loading profile…</Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (viewerAccess.viewer.kind === 'anonymous') {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>
              <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to edit this
              ruleset.
            </Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (!viewerAccess.capabilities.edit) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>
              {r.group_id
                ? 'Only the ruleset owner or an active member of its group can edit this ruleset.'
                : 'Only the ruleset owner can edit this ruleset.'}
            </Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header>{header}</PageLayout.Header>
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <Surface padding="lg">
          <RulesetSettings key={r.slug} initial={r} canRename={viewerAccess.capabilities.rename} />
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

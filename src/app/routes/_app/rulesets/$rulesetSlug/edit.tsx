import {
  ActionIcon,
  Anchor,
  Center,
  Group,
  Image,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, BookOpen } from 'lucide-react';

import { useCurrentProfile } from '@db/profiles';
import { loadRulesetDetailPage, useRulesetDetailPage } from '@db/rulesets';
import { RulesetSettingsForm } from '@app/components/rulesets/RulesetSettingsForm';
import { PageLayout } from '@app/components/shell';

import styles from './edit.module.css';

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
  const detailSeed =
    !loaderData.notFound && loaderData.detailPage ? loaderData.detailPage : undefined;
  const page = useRulesetDetailPage(rulesetSlug, { initialData: detailSeed });
  const profile = useCurrentProfile();

  const header = page.ruleset ? (
    <Group wrap="nowrap" align="center" gap="lg" className={styles.pageHead}>
      <Paper className={styles.rulesetHeadCover} radius="md" withBorder>
        {page.ruleset.image_cover ? (
          <Image
            src={page.ruleset.image_cover}
            fallbackSrc="/image/background/card.jpg"
            alt={`Cover for ${page.ruleset.name}`}
            className={styles.coverImage}
          />
        ) : (
          <Center h="100%">
            <Text size="xs" c="dimmed" ta="center">
              No cover
            </Text>
          </Center>
        )}
      </Paper>
      <Stack gap={6} className={styles.pageHeadText}>
        <Title order={1} className={styles.rulesetTitle}>
          Edit {page.ruleset.name}
        </Title>
      </Stack>
    </Group>
  ) : (
    <Title order={1}>Edit ruleset</Title>
  );
  const toolbar = (
    <Paper withBorder p="sm" radius="md">
      <Group gap="xs" wrap="wrap" role="group" aria-label="Ruleset navigation">
        <Tooltip label="Back to rulesets">
          <ActionIcon
            variant="light"
            color="gray"
            size="lg"
            aria-label="Back to rulesets"
            renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
          >
            <ArrowLeft size={17} aria-hidden />
          </ActionIcon>
        </Tooltip>
        {page.ruleset ? (
          <Tooltip label="View ruleset">
            <ActionIcon
              variant="light"
              color="dune"
              size="lg"
              aria-label="View ruleset"
              renderRoot={(rootProps) => (
                <Link
                  {...rootProps}
                  to="/rulesets/$rulesetSlug"
                  params={{ rulesetSlug: page.ruleset?.slug ?? rulesetSlug }}
                />
              )}
            >
              <BookOpen size={17} aria-hidden />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </Group>
    </Paper>
  );

  if (loaderData.notFound) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Paper withBorder p="xl" radius="md">
          <Text>Ruleset not found.</Text>
        </Paper>
      </PageLayout>
    );
  }

  if (!page.ruleset) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Paper withBorder p="xl" radius="md">
          <Text>Ruleset not found.</Text>
        </Paper>
      </PageLayout>
    );
  }

  const r = page.ruleset;
  const viewerUserId = profile.data?.user_id;

  if (profile.isPending) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Paper withBorder p="xl" radius="md" aria-live="polite">
          <Text>Loading profile…</Text>
        </Paper>
      </PageLayout>
    );
  }

  if (!viewerUserId) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Paper withBorder p="xl" radius="md">
          <Text>
            <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>
              Log in
            </Anchor>{' '}
            to edit this ruleset.
          </Text>
        </Paper>
      </PageLayout>
    );
  }

  if (!page.canEditRuleset) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Paper withBorder p="xl" radius="md">
          <Text>
            {r.group_id
              ? 'Only the ruleset owner or an active member of its group can edit this ruleset.'
              : 'Only the ruleset owner can edit this ruleset.'}
          </Text>
        </Paper>
      </PageLayout>
    );
  }

  return (
    <PageLayout header={header} toolbar={toolbar}>
      <Paper withBorder p="lg" radius="md">
        <RulesetSettingsForm key={r.slug} initial={r} canRename={r.owner_id === viewerUserId} />
      </Paper>
    </PageLayout>
  );
}

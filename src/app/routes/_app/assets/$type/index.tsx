import { Anchor, Group, Stack, Text, Title } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

import { loadAssetsByTypes, useAssetsByTypes } from '@app/db/assets';

import { AssetFace } from '../-assetFaces';

export const Route = createFileRoute('/_app/assets/$type/')({
  loader: async ({ params }) => {
    if (!isAssetType(params.type)) {
      throw notFound();
    }
    return await loadAssetsByTypes([params.type]);
  },
  component: AssetTypePage,
});

function AssetTypePage() {
  const { type } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const validType = isAssetType(type) ? type : 'card-treachery';
  const definition = ASSET_TYPES[validType];
  const assets = useAssetsByTypes([validType], { initialData: loaderData });
  const entries = assets.data ?? loaderData;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack gap={2} align="center">
          <Eyebrow tone="inverse">Community assets</Eyebrow>
          <Title order={1}>{definition.label}</Title>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          {definition.status === 'planned' ? (
            <Stack gap="xs" align="center">
              <Title order={2}>Planned</Title>
              <Text c="dimmed" ta="center">
                {definition.label} are on the roadmap — this type cannot hold assets yet.
              </Text>
            </Stack>
          ) : entries.length === 0 ? (
            <Stack gap="xs" align="center">
              <Title order={2}>Nothing here yet</Title>
              <Text c="dimmed" ta="center">
                No {definition.label.toLowerCase()} have been created so far.
              </Text>
            </Stack>
          ) : (
            <Group gap="xl" align="flex-start" justify="center">
              {entries.map((entry) => (
                <Stack key={entry.id} gap={6} align="center">
                  <AssetFace
                    type={entry.type}
                    data={entry.data}
                    name={entry.name}
                    width={entry.type.startsWith('token-') ? 140 : 150}
                  />
                  <Text size="sm" fw={600}>
                    {entry.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {entry.owner?.username ? `by ${entry.owner.username}` : ''}
                  </Text>
                  {/* Only types with a landed editor get the affordance; the asset detail page will take over this role. */}
                  {entry.type === 'card-treachery' ? (
                    <Anchor
                      size="xs"
                      renderRoot={(rootProps) => (
                        <Link {...rootProps} to="/assets/card-treachery/$slug/edit" params={{ slug: entry.slug }} />
                      )}
                    >
                      Edit
                    </Anchor>
                  ) : null}
                </Stack>
              ))}
            </Group>
          )}
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

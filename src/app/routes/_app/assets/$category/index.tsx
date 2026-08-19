import { Group, Stack, Text, Title } from '@mantine/core';
import { ASSET_TYPES, isAssetCategory, liveTypesInCategory, typesInCategory } from '@shared/assets/types';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

import { loadAssetsByTypes, useAssetsByTypes } from '@app/db/assets';

import { AssetFace } from '../-assetFaces';

export const Route = createFileRoute('/_app/assets/$category/')({
  loader: async ({ params }) => {
    if (!isAssetCategory(params.category)) {
      throw notFound();
    }
    return await loadAssetsByTypes(liveTypesInCategory(params.category));
  },
  component: AssetCategoryPage,
});

const CATEGORY_TITLES = {
  cards: 'Cards',
  decks: 'Decks',
  tokens: 'Tokens',
  boards: 'Boards',
} as const;

function AssetCategoryPage() {
  const { category } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const validCategory = isAssetCategory(category) ? category : 'cards';
  const liveTypes = liveTypesInCategory(validCategory);
  const assets = useAssetsByTypes(liveTypes, { initialData: loaderData });
  const entries = assets.data ?? loaderData;
  const plannedTypes = typesInCategory(validCategory).filter((type) => ASSET_TYPES[type].status === 'planned');

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack gap={2} align="center">
          <Eyebrow tone="inverse">Community assets</Eyebrow>
          <Title order={1}>{CATEGORY_TITLES[validCategory]}</Title>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          {liveTypes.length === 0 ? (
            <Stack gap="xs" align="center">
              <Title order={2}>Planned</Title>
              <Text c="dimmed" ta="center">
                {CATEGORY_TITLES[validCategory]} are on the roadmap — this category cannot hold assets yet.
              </Text>
            </Stack>
          ) : entries.length === 0 ? (
            <Stack gap="xs" align="center">
              <Title order={2}>Nothing here yet</Title>
              <Text c="dimmed" ta="center">
                No {CATEGORY_TITLES[validCategory].toLowerCase()} have been created so far.
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
                    {ASSET_TYPES[entry.type as keyof typeof ASSET_TYPES]?.label ?? entry.type}
                    {entry.owner?.username ? ` · by ${entry.owner.username}` : ''}
                  </Text>
                </Stack>
              ))}
            </Group>
          )}
          {plannedTypes.length > 0 && liveTypes.length > 0 ? (
            <Text size="xs" c="dimmed" ta="center" mt="lg">
              Planned here: {plannedTypes.map((type) => ASSET_TYPES[type].label).join(', ')}.
            </Text>
          ) : null}
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

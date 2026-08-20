import { Anchor, Button, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { CallToAction } from '@ui/control/CallToAction';
import { IconAction } from '@ui/control/IconAction';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { loadAssetBrowsePage, useAssetBrowsePage } from '@app/db/assets';
import type { AssetBrowseEntry } from '@app/db/assets';
import { AssetFace, assetFaceAspect } from '@app/widgets/asset-face/AssetFace';

import { applyAssetBrowseSearch, ASSET_BROWSE_SORTS, parseAssetBrowseSearch } from './-browse';
import type { AssetBrowseSearch } from './-browse';
import styles from './index.module.css';

/**
 * The type's name as a noun for one of them.
 * `shortLabel` is not a noun for every type, since it is an adjective for tokens and "Create a round" was a real defect, so the singular comes off `label` instead.
 */
function singularLabel(label: string): string {
  return label.endsWith('s') ? label.slice(0, -1) : label;
}

export const Route = createFileRoute('/_app/assets/$type/')({
  validateSearch: parseAssetBrowseSearch,
  /* The path param is the only loader input. Search state is applied to what this returns, and this repo uses no `loaderDeps`, so a filter change must never need a refetch. */
  loader: async ({ params }) => {
    if (!isAssetType(params.type)) {
      throw notFound();
    }
    return await loadAssetBrowsePage(params.type);
  },
  component: AssetTypePage,
});

function AssetTypePage() {
  const { type } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const validType = isAssetType(type) ? type : 'card-treachery';
  const definition = ASSET_TYPES[validType];
  const page = useAssetBrowsePage(validType, { initialData: loaderData });
  const data = page.data ?? loaderData;
  const [draft, setDraft] = useState(search.q ?? '');

  const noun = singularLabel(definition.label);
  const entries = applyAssetBrowseSearch(data.entries, search);
  const total = data.entries.length;

  /* Every write spreads the previous search and re-parses, so unmentioned params survive and a default never reaches the URL. Replacing keeps a browse session to one history entry. */
  const changeSearch = (patch: Partial<Record<keyof AssetBrowseSearch, unknown>>) => {
    void navigate({
      to: '.',
      search: (previous) => parseAssetBrowseSearch({ ...previous, ...patch }),
      replace: true,
    });
  };

  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="xs" align="center">
          <Eyebrow tone="inverse">Community assets</Eyebrow>
          <Title order={1}>{definition.label}</Title>
          <Text c="dimmed" ta="center" maw="34rem">
            Every {noun.toLowerCase()} the community has made. Open one to see it up close, or make your own.
          </Text>
          {definition.status === 'live' ? (
            <CallToAction
              attention
              renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$type/create" params={{ type: validType }} />}
            >
              Create a {noun.toLowerCase()}
            </CallToAction>
          ) : null}
        </Stack>
      </PageLayout.Header>
      {definition.status === 'live' ? (
        <PageLayout.Toolbar>
          <Toolbar>
            <Toolbar.Left>
              <Group gap="sm" wrap="nowrap">
                <Text size="sm" c="dimmed" className={styles.resultCount}>
                  {entries.length === total ? `${total}${data.truncated ? '+' : ''}` : `${entries.length} of ${total}`}
                </Text>
                {data.inNoDeckCount === null ? null : (
                  <Button
                    size="compact-sm"
                    variant={search.deck === 'none' ? 'filled' : 'default'}
                    aria-pressed={search.deck === 'none'}
                    onClick={() => changeSearch({ deck: search.deck === 'none' ? undefined : 'none' })}
                  >
                    In no deck ({data.inNoDeckCount})
                  </Button>
                )}
              </Group>
            </Toolbar.Left>
            <Toolbar.Center>
              {/* The band's centre width comes from this field, not from the toolbar. */}
              <fieldset className={styles.joinedFilters} aria-label={`${definition.label} filters`}>
                <TextInput
                  className={styles.searchSegment}
                  variant="unstyled"
                  value={draft}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  onBlur={() => changeSearch({ q: draft })}
                  onKeyDown={(event) => event.key === 'Enter' && changeSearch({ q: draft })}
                  placeholder="Search by name or owner…"
                  aria-label={`Search ${definition.label.toLowerCase()}`}
                  leftSection={<Search size={16} aria-hidden />}
                />
                <Select
                  className={styles.sortSegment}
                  variant="unstyled"
                  aria-label="Sort"
                  allowDeselect={false}
                  data={ASSET_BROWSE_SORTS}
                  value={search.sort ?? 'newest'}
                  onChange={(value) => changeSearch({ sort: value === 'newest' ? undefined : value })}
                />
              </fieldset>
            </Toolbar.Center>
            <Toolbar.Right>
              <IconAction
                label={`Create a ${noun.toLowerCase()}`}
                variant="filled"
                color="confirm"
                size="lg"
                renderRoot={(rootProps) => (
                  <Link {...rootProps} to="/assets/$type/create" params={{ type: validType }} />
                )}
                icon={<Plus size={17} aria-hidden />}
              />
            </Toolbar.Right>
          </Toolbar>
        </PageLayout.Toolbar>
      ) : null}
      <PageLayout.Content>
        <Surface padding="xl">
          {definition.status === 'planned' ? (
            <Stack gap="xs" align="center">
              <Title order={2}>Planned</Title>
              <Text c="dimmed" ta="center">
                {definition.label} are on the roadmap. This type cannot hold assets yet.
              </Text>
            </Stack>
          ) : entries.length === 0 ? (
            <Stack gap="xs" align="center">
              <Title order={2}>{total === 0 ? 'Nothing here yet' : 'Nothing matches'}</Title>
              <Text c="dimmed" ta="center">
                {total === 0
                  ? `No ${definition.label.toLowerCase()} have been created so far.`
                  : 'No asset on this page matches the current search.'}
              </Text>
            </Stack>
          ) : (
            <div className={styles.uniformGrid}>
              {entries.map((entry) => (
                <BrowseTile key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** How many decks hold this card, or nothing at all when the answer is zero or the question does not apply. */
function membershipLabel(deckCount: number): string | null {
  switch (deckCount) {
    case 0:
      return null;
    case 1:
      return '1 deck';
    default:
      return `${deckCount} decks`;
  }
}

/**
 * One slot on the grid.
 * The whole tile is an anchor so it is middle-clickable and copyable, and the Edit affordance is a **sibling** of that anchor rather than a child, because an anchor may not contain a control.
 */
function BrowseTile({ entry }: { entry: AssetBrowseEntry }) {
  const meta = [entry.owner?.username, membershipLabel(entry.deckCount)].filter(Boolean).join(' · ');
  return (
    <div className={styles.tile}>
      <Link
        className={styles.tileOpen}
        to="/assets/$type/$slug"
        params={{ type: entry.type, slug: entry.slug }}
        aria-label={entry.name}
      >
        <Stack gap={6}>
          <div className={styles.tileArt}>
            {/* A container's members stand above it and make the drawing taller, so the canvas is asked for the block's height rather than the face's. */}
            <CanvasScale canvasWidth={900} canvasHeight={900 * assetFaceAspect(entry.type, entry.members.length)}>
              <AssetFace type={entry.type} data={entry.data} name={entry.name} width={900} members={entry.members} />
            </CanvasScale>
          </div>
          <Stack gap={0}>
            <Text size="sm" fw={600} lineClamp={1}>
              {entry.name}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {meta}
            </Text>
          </Stack>
        </Stack>
      </Link>
      <div className={styles.tileActions}>
        <Anchor
          size="xs"
          renderRoot={(rootProps) => (
            <Link {...rootProps} to="/assets/$type/$slug/edit" params={{ type: entry.type, slug: entry.slug }} />
          )}
        >
          Edit
        </Anchor>
      </div>
    </div>
  );
}

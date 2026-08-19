/**
 * PROTOTYPE — the Asset detail page, wayfinder tickets #512 and #515.
 * THROWAWAY.
 *
 * Replaces the modal and the sticky rail the browse prototype offered: Norbert rejected the modal outright (2026-08-20), and the rail was the same component in a different place rather than a second answer.
 * A page beats both at everything the up-close view was for — it is addressable, shareable, middle-clickable and back-buttonable, and it has room for the deck names, the download and the edit affordance the 20rem rail was already truncating.
 *
 * This reverses #515's premise that a detail page is overkill for every type but decks and boards.
 * One route serves every Asset type: the frame — identity band, toolbar, face, decks, files — is the same for a card, a token and a deck, and only the column beside the face differs.
 *
 * Two prototype shortcuts, both deliberate:
 * - It reads the type's whole list and finds the slug, rather than adding a Convex query.
 * A real page needs a `getForRead({type, slug})`;
 * nothing here is worth a schema change before the design is signed off.
 * - Deck names link to this same route with `type: 'deck'`, which is the payoff of one route per type — but no deck can exist yet (`parseAssetDataForWrite` throws for every type but `card-treachery`), so those links land on the not-found body.
 */
import { Alert, Anchor, Group, Stack, Text, Title } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ProposedContent } from '@ui/block/ProposedContent';
import { Section } from '@ui/block/Section';
import { ProfileLink } from '@ui/content/ProfileLink';
import { IconAction } from '@ui/control/IconAction';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { ColumnsWithRailLayout } from '@ui/layout/ColumnsWithRailLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { Links } from '@ui/list/Links';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, BookOpen, Layers3, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';

import { loadAssetsByTypes, useAssetsByTypes } from '@app/db/assets';
import type { AssetListEntry } from '@app/db/assets';

import { AssetFace, assetCanvasAspect } from '../../-assetFaces';
import { decksOf, mockEntriesFor } from '../../-mockCatalogue';
import styles from './index.module.css';

export const Route = createFileRoute('/_app/assets/$type/$slug/')({
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  loader: async ({ params }) => {
    if (!isAssetType(params.type)) {
      throw notFound();
    }
    return await loadAssetsByTypes([params.type]);
  },
  pendingComponent: AssetDetailPending,
  errorComponent: AssetDetailError,
  component: AssetDetailPage,
});

/**
 * The frame this page wears before it has an asset: loading, not found, failed to load.
 * One component because all three are the same page with different words — the detail pages that came before this each repeat the markup two or three times.
 */
function AssetDetailMessage({ children }: { children: ReactNode }) {
  const { type } = Route.useParams();
  const label = isAssetType(type) ? ASSET_TYPES[type].label : 'Assets';
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack align="center" gap="xs">
          <Title order={1}>{label}</Title>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$type" params={{ type }} />}>
            Back to {label.toLowerCase()}
          </Anchor>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>{children}</PageLayout.Content>
    </PageLayout>
  );
}

function AssetDetailPending() {
  return (
    <AssetDetailMessage>
      <Surface padding="xl">
        <Stack gap="xs">
          <Title order={2}>Loading</Title>
          <Text c="dimmed">This asset is still loading.</Text>
        </Stack>
      </Surface>
    </AssetDetailMessage>
  );
}

function AssetDetailError({ error }: ErrorComponentProps) {
  return (
    <AssetDetailMessage>
      <Alert color="red" title="This asset could not be loaded" role="alert">
        <Text size="sm">{error.message || 'An unexpected error occurred.'}</Text>
      </Alert>
    </AssetDetailMessage>
  );
}

/**
 * The one region that is not the same for every Asset type.
 * A card is its face and nothing else;
 * a deck has composition and the rulesets that ship it.
 * A lookup rather than a switch, so a new type is one entry and the page never learns about it.
 */
function AssetDetailBody({ entry }: { entry: AssetListEntry }) {
  if (entry.type === 'deck') {
    return (
      <Section
        id="composition"
        icon={<Layers3 size={20} aria-hidden />}
        title="Composition"
        description="The cards in this deck and how many of each."
      >
        <ProposedContent label="Proposed content">
          <Text size="sm" c="dimmed">
            Composition reads `asset_relations` by `from_asset_id`, which nothing writes yet.
          </Text>
        </ProposedContent>
      </Section>
    );
  }
  return (
    <Section title="About" icon={<BookOpen size={20} aria-hidden />}>
      <ProposedContent label="Proposed content">
        <Text size="sm" c="dimmed">
          Nothing lives beside the face yet. Notes, a revision history, and the rulesets that ship it could go here.
        </Text>
      </ProposedContent>
    </Section>
  );
}

function AssetDetailPage() {
  const { type, slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const live = useAssetsByTypes([type], { initialData: loaderData });
  const real = live.data ?? loaderData;
  const pool = [...mockEntriesFor(type), ...real];
  const entry = pool.find((candidate) => candidate.slug === slug);
  const definition = ASSET_TYPES[type as keyof typeof ASSET_TYPES];

  if (!entry) {
    return (
      <AssetDetailMessage>
        <Surface padding="xl">
          <Stack gap="xs">
            <Title order={2}>Asset not found</Title>
            <Text c="dimmed">
              Nothing lives at this address. Renaming an asset re-slugs its URL, so an old link may have moved.
            </Text>
          </Stack>
        </Surface>
      </AssetDetailMessage>
    );
  }

  const decks = decksOf(entry);
  const owner = entry.owner;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        {/* The identity pattern the faction and ruleset detail pages use: the media sits in its own column, so the breadcrumb, the title and the meta line share one left edge. */}
        <Group wrap="nowrap" align="center" gap="lg" className={styles.pageHead}>
          <div className={styles.pageHeadMedia} role="img" aria-label={`${entry.name} face`}>
            <CanvasScale canvasWidth={900} canvasHeight={900 * assetCanvasAspect(entry.type)}>
              <AssetFace type={entry.type} data={entry.data} name={entry.name} width={900} />
            </CanvasScale>
          </div>
          <Stack gap={6} className={styles.pageHeadText}>
            <Group gap="xs" wrap="wrap">
              <Anchor
                size="sm"
                fw={600}
                renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$type" params={{ type }} />}
              >
                {definition?.label ?? 'Assets'}
              </Anchor>
            </Group>
            <Title order={1} className={styles.assetTitle}>
              {entry.name}
            </Title>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" c="dimmed">
                Made by
              </Text>
              {owner ? <ProfileLink {...owner} /> : <Text size="sm">Unknown</Text>}
            </Group>
          </Stack>
        </Group>
      </PageLayout.Header>

      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group role="group" aria-label="Navigation and editing" gap="xs">
              <IconAction
                label={`Back to ${definition?.label.toLowerCase() ?? 'assets'}`}
                variant="subtle"
                color="gray"
                size="lg"
                icon={<ArrowLeft size={17} aria-hidden />}
                renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$type" params={{ type }} />}
              />
              {/* Type-conditional because the editor route is still literal per type — see the shadowing note on the ticket. */}
              {entry.type === 'card-treachery' ? (
                <IconAction
                  label={`Edit ${entry.name}`}
                  variant="subtle"
                  color="gray"
                  size="lg"
                  icon={<Pencil size={17} aria-hidden />}
                  renderRoot={(rootProps) => (
                    <Link {...rootProps} to="/assets/card-treachery/$slug/edit" params={{ slug: entry.slug }} />
                  )}
                />
              ) : null}
            </Group>
          </Toolbar.Left>
        </Toolbar>
      </PageLayout.Toolbar>

      <PageLayout.Content>
        <ColumnsWithRailLayout>
          <ColumnsWithRailLayout.Primary>
            <div className={styles.faceStage}>
              <CanvasScale canvasWidth={900} canvasHeight={900 * assetCanvasAspect(entry.type)}>
                <AssetFace type={entry.type} data={entry.data} name={entry.name} width={900} />
              </CanvasScale>
            </div>
          </ColumnsWithRailLayout.Primary>

          <ColumnsWithRailLayout.Secondary>
            <AssetDetailBody entry={entry} />
          </ColumnsWithRailLayout.Secondary>

          <ColumnsWithRailLayout.Rail>
            <Stack gap="lg">
              {/*
               * The names, as real links to this same route with `type: 'deck'`.
               * This is the payoff of one route serving every type: what the browse prototype had to render as inert rows becomes navigation the day a deck exists.
               */}
              <Card title="In decks" icon={<Layers3 size={18} aria-hidden />}>
                {decks.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Not in any deck yet.
                  </Text>
                ) : (
                  <Links>
                    {decks.map((deck) => (
                      <Links.Item key={deck.id} to="/assets/$type/$slug" params={{ type: 'deck', slug: deck.slug }}>
                        {deck.name}
                      </Links.Item>
                    ))}
                  </Links>
                )}
              </Card>

              <Card title="Files">
                <ProposedContent label="Proposed content">
                  <Text size="sm" c="dimmed">
                    The published image and its download land here once the publisher covers asset images.
                  </Text>
                </ProposedContent>
              </Card>
            </Stack>
          </ColumnsWithRailLayout.Rail>
        </ColumnsWithRailLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}

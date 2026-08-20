/**
 * The Asset detail page, one route for every Asset type.
 *
 * Addressability outranks content volume (Norbert, 2026-08-20): a sparse page is not an argument against a page, so a token with nothing but a face still gets a URL somebody can link to.
 * Only the column beside the face differs per type;
 * the frame, the toolbar and the rail are the same for a card, a token and a deck.
 *
 * A soft-deleted asset reads as absent here.
 * Its slug stays reserved so the address survives, but the page renders the same body a slug that never existed would get, matching the ruleset detail page.
 * That is deliberately not a claim that nothing was ever here, and nothing of the deleted row reaches the client to leak.
 */
import { Alert, Anchor, Group, Stack, Text, Title } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { ProfileLink } from '@ui/content/ProfileLink';
import { AssignPopover } from '@ui/control/AssignPopover';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { ColumnsWithRailLayout } from '@ui/layout/ColumnsWithRailLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { Links } from '@ui/list/Links';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Download, Info, Layers3, Pencil, UserRoundMinus, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';

import { loadAssetPage, useAssetPage, useDeleteAsset, useSetAssetGroup } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetFace, assetFaceAspect } from '@app/widgets/asset-face/AssetFace';

import styles from './index.module.css';

type AssetPage = NonNullable<AssetPageData>;

export const Route = createFileRoute('/_app/assets/$type/$slug/')({
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  loader: async ({ params }) => {
    if (!isAssetType(params.type)) {
      throw notFound();
    }
    return await loadAssetPage(params.type, params.slug);
  },
  pendingComponent: AssetDetailPending,
  errorComponent: AssetDetailError,
  component: AssetDetailPage,
});

/**
 * The frame this page wears before it has an asset: loading, absent, failed to load.
 * One component because all three are the same page with different words;
 * the three detail pages before this each repeat the markup two or three times.
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

/** One face at reading size, captioned. Tokens use two of these; everything else uses one, uncaptioned. */
function FaceStage({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <Stack gap={6} align="center" className={styles.faceStage}>
      {children}
      {caption ? (
        <Text size="xs" c="dimmed">
          {caption}
        </Text>
      ) : null}
    </Stack>
  );
}

function ScaledFace({
  type,
  data,
  name,
  side,
}: {
  type: string;
  data: unknown;
  name: string;
  side?: 'front' | 'back';
}) {
  return (
    <CanvasScale canvasWidth={900} canvasHeight={900 * assetFaceAspect(type)}>
      <AssetFace type={type} data={data} name={name} width={900} side={side} />
    </CanvasScale>
  );
}

/**
 * What Primary holds.
 *
 * Tokens stack both faces, the shape the token editor's rail already settled on.
 * A *referenced* back is the interesting case: it is another token's front, never copied data, so the page draws that token's own face from its own row and links to it.
 * That is the same payoff the "In decks" card has, one route per type turning a relation row into navigation.
 * A back pointing at a soft-deleted token resolves to nothing, and saying so beats a silently single-faced page.
 */
function AssetFaces({ page }: { page: AssetPage }) {
  const { asset, backToken } = page;
  const isToken = asset.type.startsWith('token-');
  if (!isToken) {
    return <ScaledFace type={asset.type} data={asset.data} name={asset.name} />;
  }

  const back = (asset.data as { back?: { mode?: string } } | null)?.back;
  return (
    <Stack gap="lg" align="center">
      <FaceStage caption="Front">
        <ScaledFace type={asset.type} data={asset.data} name={asset.name} side="front" />
      </FaceStage>
      {back?.mode === 'reference' ? (
        backToken ? (
          <FaceStage
            caption={
              <>
                Back:{' '}
                <Anchor
                  size="xs"
                  renderRoot={(rootProps) => (
                    <Link
                      {...rootProps}
                      to="/assets/$type/$slug"
                      params={{ type: backToken.type, slug: backToken.slug }}
                    />
                  )}
                >
                  {backToken.name}
                </Anchor>
              </>
            }
          >
            <ScaledFace type={backToken.type} data={backToken.data} name={backToken.name} side="front" />
          </FaceStage>
        ) : (
          <Text size="sm" c="dimmed">
            This token's back points at a token that was deleted.
          </Text>
        )
      ) : (
        <FaceStage caption="Back">
          <ScaledFace type={asset.type} data={asset.data} name={asset.name} side="back" />
        </FaceStage>
      )}
    </Stack>
  );
}

/** Prose the face cannot carry. Renders nothing at all when empty, which is the normal case (CONTEXT.md: About). */
function AboutSection({ about }: { about: string }) {
  if (!about.trim()) {
    return null;
  }
  return (
    <Section id="about" icon={<Info size={20} aria-hidden />} title="About">
      <Surface padding="lg">
        <Text className={styles.about}>{about}</Text>
      </Surface>
    </Section>
  );
}

/** A deck's cards and how many of each. Read-only here; composition is managed in the deck editor. */
function DeckComposition({ deckCards }: { deckCards: AssetPage['deckCards'] }) {
  return (
    <Section
      id="composition"
      icon={<Layers3 size={20} aria-hidden />}
      title="Composition"
      description="The cards in this deck and how many of each."
    >
      {deckCards.length === 0 ? (
        <Surface padding="lg">
          <Text size="sm" c="dimmed">
            This deck holds no cards yet.
          </Text>
        </Surface>
      ) : (
        <Links>
          {deckCards.map(({ card, count }) => (
            <Links.Item key={card.id} to="/assets/$type/$slug" params={{ type: card.type, slug: card.slug }}>
              {count > 1 ? `${card.name} ×${count}` : card.name}
            </Links.Item>
          ))}
        </Links>
      )}
    </Section>
  );
}

/**
 * The one region that is not the same for every Asset type.
 * A card or token is its face, so it gets About and nothing else;
 * a deck gets its composition first.
 * A lookup rather than a switch, so a new type is one entry and the route never learns about it.
 */
const PER_TYPE_BODY: Record<string, (page: AssetPage) => ReactNode> = {
  deck: (page) => <DeckComposition deckCards={page.deckCards} />,
};

function AssetDetailBody({ page }: { page: AssetPage }) {
  const about =
    typeof (page.asset.data as { about?: unknown })?.about === 'string'
      ? (page.asset.data as { about: string }).about
      : '';
  return (
    <Stack gap="lg">
      {PER_TYPE_BODY[page.asset.type]?.(page)}
      <AboutSection about={about} />
    </Stack>
  );
}

function AssetDetailPage() {
  const { type, slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const live = useAssetPage(type, slug, { initialData: loaderData });
  const page = live.data ?? loaderData;
  const navigate = useNavigate();
  const setAssetGroup = useSetAssetGroup();
  const deleteAsset = useDeleteAsset();

  if (!page) {
    return (
      <AssetDetailMessage>
        <Surface padding="xl">
          <Stack gap="xs">
            <Title order={2}>Asset not found</Title>
            <Text c="dimmed">
              This asset does not exist or was deleted. Renaming an asset re-slugs its URL, so an old link may have
              moved.
            </Text>
          </Stack>
        </Surface>
      </AssetDetailMessage>
    );
  }

  const { asset, viewerAccess, assignableGroups, inDecks, assetPublishing } = page;
  const { capabilities, assignedGroup } = viewerAccess;
  const definition = isAssetType(asset.type) ? ASSET_TYPES[asset.type] : undefined;
  const collectionLabel = definition?.label ?? 'Assets';
  const showRight = Boolean(assetPublishing?.publicationHref) || capabilities.changeGroup || capabilities.delete;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        {/* The identity pattern the faction and ruleset detail pages use: the media sits in its own column, so the breadcrumb, the title and the meta line share one left edge. */}
        <Group wrap="nowrap" align="center" gap="lg" className={styles.pageHead}>
          <div className={styles.pageHeadMedia} role="img" aria-label={`${asset.name} face`}>
            <ScaledFace type={asset.type} data={asset.data} name={asset.name} />
          </div>
          <Stack gap={6} className={styles.pageHeadText}>
            <Group gap="xs" wrap="wrap">
              <Anchor
                size="sm"
                fw={600}
                renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$type" params={{ type: asset.type }} />}
              >
                {collectionLabel}
              </Anchor>
            </Group>
            <Title order={1} className={styles.assetTitle}>
              {asset.name}
            </Title>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" c="dimmed">
                Made by
              </Text>
              {asset.owner ? <ProfileLink {...asset.owner} /> : <Text size="sm">Unknown</Text>}
            </Group>
          </Stack>
        </Group>
      </PageLayout.Header>

      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group role="group" aria-label="Navigation and editing" gap="xs" wrap="wrap">
              <IconAction
                label={`Back to ${collectionLabel.toLowerCase()}`}
                variant="light"
                color="gray"
                size="lg"
                icon={<ArrowLeft size={17} aria-hidden />}
                renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$type" params={{ type: asset.type }} />}
              />
              {capabilities.edit ? (
                <IconAction
                  label={`Edit ${asset.name}`}
                  variant="light"
                  color="dune"
                  size="lg"
                  icon={<Pencil size={17} aria-hidden />}
                  renderRoot={(rootProps) => (
                    <Link
                      {...rootProps}
                      to="/assets/$type/$slug/edit"
                      params={{ type: asset.type, slug: asset.slug }}
                    />
                  )}
                />
              ) : null}
            </Group>
          </Toolbar.Left>
          {/* The management actions the map's standing rule puts on the detail page as well as the edit page, each gated on the viewer's real capabilities. */}
          {showRight ? (
            <Toolbar.Right>
              <Group role="group" aria-label={`${collectionLabel} actions`} gap="xs" wrap="wrap">
                {assetPublishing?.publicationHref ? (
                  <IconAction
                    label="Open published image"
                    variant="light"
                    color="dune"
                    size="lg"
                    href={assetPublishing.publicationHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<Download size={17} aria-hidden />}
                  />
                ) : null}
                {capabilities.changeGroup ? (
                  assignedGroup ? (
                    <IconAction
                      label="Remove group"
                      variant="light"
                      color="red"
                      size="lg"
                      disabled={setAssetGroup.isPending}
                      onClick={() => setAssetGroup.mutate({ id: asset.id, group_id: null })}
                      icon={<UserRoundMinus size={17} aria-hidden />}
                    />
                  ) : (
                    <AssignPopover
                      noun="group"
                      triggerLabel="Assign group"
                      icon={<UsersRound size={17} aria-hidden />}
                      title="Assign Group"
                      descriptionLines={[
                        `Assign a group whose members can help maintain "${asset.name}".`,
                        'You can create and join groups from your profile.',
                      ]}
                      disabled={setAssetGroup.isPending}
                      options={assignableGroups.map((group) => ({
                        value: group.id,
                        label: `${group.name} (${group.slug})`,
                      }))}
                      onAssign={async (nextGroupId) => {
                        await setAssetGroup.mutateAsync({ id: asset.id, group_id: nextGroupId });
                      }}
                    />
                  )
                ) : null}
                {capabilities.delete ? (
                  <ConfirmDeleteAction
                    label={`Delete ${asset.name}`}
                    prompt="Delete this asset?"
                    pending={deleteAsset.isPending}
                    /* This page IS the asset's address, so a successful delete has nowhere to stay; the type it belonged to is also where a reader arriving from a browse tile came from. */
                    onConfirm={() =>
                      deleteAsset.mutate(
                        { id: asset.id },
                        { onSuccess: () => void navigate({ to: '/assets/$type', params: { type: asset.type } }) }
                      )
                    }
                  />
                ) : null}
              </Group>
            </Toolbar.Right>
          ) : null}
        </Toolbar>
      </PageLayout.Toolbar>

      <PageLayout.Content>
        <ColumnsWithRailLayout>
          <ColumnsWithRailLayout.Primary>
            <AssetFaces page={page} />
          </ColumnsWithRailLayout.Primary>

          <ColumnsWithRailLayout.Secondary>
            <AssetDetailBody page={page} />
          </ColumnsWithRailLayout.Secondary>

          <ColumnsWithRailLayout.Rail>
            <Stack gap="lg">
              {assignedGroup ? (
                <Card title="Maintained by" icon={<UsersRound size={18} aria-hidden />}>
                  <Text size="sm">{assignedGroup.name}</Text>
                </Card>
              ) : null}
              {/* One route per type is what turns a relation row into navigation rather than an inert name. */}
              {asset.type === 'deck' ? null : (
                <Card title="In decks" icon={<Layers3 size={18} aria-hidden />}>
                  {inDecks.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      Not in any deck yet.
                    </Text>
                  ) : (
                    <Links>
                      {inDecks.map((deck) => (
                        <Links.Item
                          key={deck.id}
                          to="/assets/$type/$slug"
                          params={{ type: deck.type, slug: deck.slug }}
                        >
                          {deck.count > 1 ? `${deck.name} ×${deck.count}` : deck.name}
                        </Links.Item>
                      ))}
                    </Links>
                  )}
                </Card>
              )}
            </Stack>
          </ColumnsWithRailLayout.Rail>
        </ColumnsWithRailLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}

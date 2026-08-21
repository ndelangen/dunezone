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
import { ASSET_TYPES, holdsDeckMembership, isAssetType } from '@shared/assets/types';
import { RULESET_ASSET_SLOTS } from '@shared/rulesets/assetSlots';
import type { RulesetAssetSlot } from '@shared/rulesets/assetSlots';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { ProfileLink } from '@ui/content/ProfileLink';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { ColumnsWithRailLayout } from '@ui/layout/ColumnsWithRailLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { Links } from '@ui/list/Links';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Boxes, Download, FlipHorizontal2, Layers3, Pencil, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';

import { loadAssetPage, useAssetPage } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetFace, assetFaceAspect } from '@app/widgets/asset-face/AssetFace';
import type { AssetFaceMember } from '@app/widgets/asset-face/AssetFace';

import { useAssetDeletion, useAssetGroupActions } from '../../-assetEditorStates';
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

/** One face at reading size, captioned. Tokens use two of these; everything else uses one, captioned only when a deck wears another's cardback. */
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
  members = [],
}: {
  type: string;
  data: unknown;
  name: string;
  side?: 'front' | 'back';
  members?: AssetFaceMember[];
}) {
  return (
    /* A container's members stand above it and make the drawing taller, so the canvas is asked for the block's height rather than the face's. */
    <CanvasScale canvasWidth={900} canvasHeight={900 * assetFaceAspect(type, members.length)}>
      <AssetFace type={type} data={data} name={name} width={900} side={side} members={members} />
    </CanvasScale>
  );
}

/**
 * The containers of one kind that hold this asset, or a line saying there are none.
 *
 * One component for decks and bundles, because "which containers hold this" is one question asked twice, and `containersHolding` already answers it with one query and a different kind literal.
 * A count above one is shown as a multiplier: a deck holding three copies of a card and a bundle holding twenty of a token are the same statement (see CONTEXT.md: Bundle).
 */
function ContainerCard({
  title,
  empty,
  containers,
  icon,
}: {
  title: string;
  empty: string;
  containers: AssetPage['inDecks'];
  icon: ReactNode;
}) {
  return (
    <Card title={title} icon={icon}>
      {containers.length === 0 ? (
        <Text size="sm" c="dimmed">
          {empty}
        </Text>
      ) : (
        <Links>
          {containers.map((container) => (
            <Links.Item
              key={container.id}
              to="/assets/$type/$slug"
              params={{ type: container.type, slug: container.slug }}
            >
              {container.count > 1 ? `${container.name} ×${container.count}` : container.name}
            </Links.Item>
          ))}
        </Links>
      )}
    </Card>
  );
}

/**
 * What Primary holds.
 *
 * Tokens stack both faces, the shape the token editor's rail already settled on.
 * A *referenced* back draws the referenced token's own BACK face from its own row and links to it: picking a token picks its back, never its front («A referenced back shows the other token's back»).
 * That is the same payoff the "In decks" card has, one route per type turning a relation row into navigation.
 * A deck wearing another deck's cardback gets the same treatment: the target's composition drawn from its own row, attributed and linked.
 * A dangling reference acts double-sided and the note says so, because without it the state is undetectable rather than merely unexplained, and saying so beats a silently single-faced page.
 * A dangling *deck* also draws the deployed fallback image beside the note, the same wrongness signal the tiles show;
 * the stored-truth page has no presentation marker to key on, so the URL is drawn explicitly.
 */
function AssetFaces({ page }: { page: AssetPage }) {
  const { asset, backToken, backDeck } = page;
  /* The server's one answer to what the back is; dangling covers a deleted target and one that stopped qualifying alike. */
  const dangling = page.resolvedBack?.mode === 'dangling';
  const isToken = asset.type.startsWith('token-');
  if (!isToken) {
    const danglingDeck = asset.type === 'deck' && dangling;
    return (
      <Stack gap="sm" align="center" w="100%">
        {/* Still one stage: a single face needs the same reading-size cap, and only a worn cardback earns a caption. */}
        <FaceStage
          caption={
            backDeck ? (
              <>
                Cardback from{' '}
                <Anchor
                  size="xs"
                  renderRoot={(rootProps) => (
                    <Link
                      {...rootProps}
                      to="/assets/$type/$slug"
                      params={{ type: backDeck.type, slug: backDeck.slug }}
                    />
                  )}
                >
                  {backDeck.name}
                </Anchor>
              </>
            ) : undefined
          }
        >
          {backDeck ? (
            <ScaledFace type="deck" data={backDeck.data} name={backDeck.name} />
          ) : danglingDeck && page.resolvedBack?.href ? (
            /* The note below carries the words, so the image is decorative to a screen reader. */
            <img src={page.resolvedBack.href} alt="" className={styles.fallbackCardback} />
          ) : (
            /* A deck's cards reach `AssetFace` here too and are ignored, which is that prop's documented contract rather than an accident. */
            <ScaledFace
              type={asset.type}
              data={asset.data}
              name={asset.name}
              members={page.members.map(({ member }) => member)}
            />
          )}
        </FaceStage>
        {danglingDeck ? (
          <Text size="sm" c="dimmed">
            The cardback this deck referenced is gone.
          </Text>
        ) : null}
      </Stack>
    );
  }

  const back = (asset.data as { back?: { mode?: string } } | null)?.back;
  return (
    <Stack gap="lg" align="center">
      <FaceStage caption="Front">
        <ScaledFace type={asset.type} data={asset.data} name={asset.name} side="front" />
      </FaceStage>
      {back?.mode === 'reference' && backToken && !dangling ? (
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
          <ScaledFace type={backToken.type} data={backToken.data} name={backToken.name} side="back" />
        </FaceStage>
      ) : (
        <FaceStage caption="Back">
          {/* A dangling reference shows the front on both sides; the note below is the only thing on the page that says otherwise. */}
          <ScaledFace type={asset.type} data={asset.data} name={asset.name} side={dangling ? 'front' : 'back'} />
        </FaceStage>
      )}
      {dangling ? (
        <Text size="sm" c="dimmed">
          The back this token referenced is gone, so it shows its front on both sides.
        </Text>
      ) : null}
    </Stack>
  );
}

/** Prose the face cannot carry. Renders nothing at all when empty, which is the normal case (CONTEXT.md: About). */
function AboutSection({ about }: { about: string }) {
  if (!about.trim()) {
    return null;
  }
  return (
    <Section id="about" icon={<TopicIcon topic="about" size={20} />} title="About">
      <Surface padding="lg">
        <Text className={styles.about}>{about}</Text>
      </Surface>
    </Section>
  );
}

/**
 * What a container holds, and how many of each.
 * Read-only here;
 * composition is managed in the container's editor.
 * One component for decks and bundles, because a deck's cards and a bundle's tokens are the same relation read.
 */
function Composition({
  members,
  truncated,
  noun,
}: {
  members: AssetPage['members'];
  truncated: boolean;
  noun: string;
}) {
  return (
    <Section
      id="composition"
      icon={<TopicIcon topic="contents" size={20} />}
      title="Composition"
      description={`The ${noun} in here and how many of each.`}
    >
      {members.length === 0 ? (
        <Surface padding="lg">
          <Text size="sm" c="dimmed">
            No {noun} yet.
          </Text>
        </Surface>
      ) : (
        <>
          <Links>
            {members.map(({ member, count }) => (
              <Links.Item key={member.id} to="/assets/$type/$slug" params={{ type: member.type, slug: member.slug }}>
                {count > 1 ? `${member.name} ×${count}` : member.name}
              </Links.Item>
            ))}
          </Links>
          {truncated ? (
            <Text size="sm" c="dimmed">
              Showing the first {members.length} {noun}; this one holds more.
            </Text>
          ) : null}
        </>
      )}
    </Section>
  );
}

/**
 * The rulesets that ship this asset, and the slot each one puts it in.
 *
 * Read-only here.
 * Slots are managed on the ruleset edit page, per «Ruleset deck-slot residual semantics», so this section links out rather than offering an action.
 * It renders nothing at all when there are none, the way About does: "no ruleset uses this yet" is not a fact worth a heading.
 */
function LinkingRulesets({ rulesets }: { rulesets: AssetPage['linkingRulesets'] }) {
  if (rulesets.length === 0) {
    return null;
  }
  return (
    <Section
      id="linking-rulesets"
      icon={<TopicIcon topic="rulesets" size={20} />}
      title="Shipped by"
      description="The rulesets that include this, and the slot each one fills with it."
    >
      <Links>
        {rulesets.map((ruleset) => (
          <Links.Item key={ruleset.id} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: ruleset.slug }}>
            {`${ruleset.name} · ${slotLabel(ruleset.slot)}`}
          </Links.Item>
        ))}
      </Links>
    </Section>
  );
}

/** The slot's own label, falling back to the stored key so an unrecognised slot names itself rather than vanishing. */
function slotLabel(slot: string): string {
  return slot in RULESET_ASSET_SLOTS ? RULESET_ASSET_SLOTS[slot as RulesetAssetSlot].label : slot;
}

/**
 * The one region that is not the same for every Asset type.
 * A card or token is its face, so it gets About and nothing else;
 * a deck gets its composition first.
 * A lookup rather than a switch, so a new type is one entry and the route never learns about it.
 */
const PER_TYPE_BODY: Record<string, (page: AssetPage) => ReactNode> = {
  /* Both slottable types show the same two sections: what is inside, then who ships it. */
  deck: (page) => (
    <>
      <Composition members={page.members} truncated={page.membersTruncated} noun="cards" />
      <LinkingRulesets rulesets={page.linkingRulesets} />
    </>
  ),
  bundle: (page) => (
    <>
      <Composition members={page.members} truncated={page.membersTruncated} noun="tokens" />
      <LinkingRulesets rulesets={page.linkingRulesets} />
    </>
  ),
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

  return <LoadedAssetDetail page={page} />;
}

/**
 * The page below the not-found guard.
 * Its own component so the management hooks can take a definite asset, which the route component cannot promise before the guard runs.
 * Group assign/remove and delete install from the shared hooks in `-assetEditorStates` rather than repeating here as a fifth copy of the same fifty lines.
 */
function LoadedAssetDetail({ page }: { page: AssetPage }) {
  const { asset, viewerAccess, assignableGroups, inDecks, inBundles, assetPublishing, backPublishing } = page;
  const groupActions = useAssetGroupActions({ asset, access: { viewerAccess, assignableGroups } });
  const deletion = useAssetDeletion(asset);
  const isToken = asset.type.startsWith('token-');
  const { capabilities, assignedGroup } = viewerAccess;
  const definition = isAssetType(asset.type) ? ASSET_TYPES[asset.type] : undefined;
  const collectionLabel = definition?.label ?? 'Assets';
  const showRight =
    Boolean(assetPublishing?.publicationHref) ||
    Boolean(backPublishing?.publicationHref) ||
    capabilities.changeGroup ||
    capabilities.delete;

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
                  color="gray"
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
                    /* Named by face only when there are two of them, so a card keeps the plain label it already had. */
                    label={backPublishing?.publicationHref ? 'Open published front' : 'Open published image'}
                    variant="light"
                    color="gray"
                    size="lg"
                    href={assetPublishing.publicationHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<Download size={17} aria-hidden />}
                  />
                ) : null}
                {/* A second published artifact rather than a second link to the first. A referenced back reaches here as null, so it offers nothing. */}
                {backPublishing?.publicationHref ? (
                  <IconAction
                    label="Open published back"
                    variant="light"
                    color="gray"
                    size="lg"
                    href={backPublishing.publicationHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<FlipHorizontal2 size={17} aria-hidden />}
                  />
                ) : null}
                {groupActions.auxiliaryActions}
                {capabilities.delete ? (
                  <ConfirmDeleteAction
                    label={`Delete ${asset.name}`}
                    prompt="Delete this asset?"
                    pending={deletion.pending}
                    onConfirm={deletion.confirm}
                  />
                ) : null}
              </Group>
            </Toolbar.Right>
          ) : null}
        </Toolbar>
      </PageLayout.Toolbar>

      <PageLayout.Content>
        {groupActions.error}
        {deletion.error ? (
          <Alert color="red" variant="light" role="alert" title="Could not delete">
            {deletion.error.message}
          </Alert>
        ) : null}
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
              {/*
               * Only what a deck can hold. It had excluded decks alone, so a bundle and every token wore an "In decks"
               * card reading "Not in any deck yet", which is true, permanent and not a fact about them: a deck holds
               * cards and nothing else (Norbert, 2026-08-20).
               */}
              {holdsDeckMembership(asset.type) ? (
                <ContainerCard
                  title="In decks"
                  empty="Not in any deck yet."
                  containers={inDecks}
                  icon={<Layers3 size={18} aria-hidden />}
                />
              ) : null}
              {/*
               * Its own card rather than a second list inside "In decks".
               * A token was reporting "Not in any deck yet" while sitting in a bundle, which is true and useless: the page had no place to say the thing that was actually so (Norbert, 2026-08-20).
               */}
              {isToken ? (
                <ContainerCard
                  title="In bundles"
                  empty="Not in any bundle yet."
                  containers={inBundles}
                  icon={<Boxes size={18} aria-hidden />}
                />
              ) : null}
            </Stack>
          </ColumnsWithRailLayout.Rail>
        </ColumnsWithRailLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}

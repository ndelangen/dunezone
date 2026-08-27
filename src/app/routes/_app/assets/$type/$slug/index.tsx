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
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { OpenableTile } from '@ui/block/OpenableTile';
import { Section } from '@ui/block/Section';
import { AssetLink } from '@ui/content/AssetLink';
import { formatRelativeDate } from '@ui/content/dates';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { GroupLink } from '@ui/content/GroupLink';
import { ProfileLink } from '@ui/content/ProfileLink';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { Links } from '@ui/list/Links';
import { Stats } from '@ui/list/Stats';
import { TileGrid } from '@ui/list/TileGrid';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  Boxes,
  CalendarPlus,
  Copy,
  Download,
  FlipHorizontal2,
  History,
  Layers3,
  Pencil,
  UsersRound,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { loadAssetPage, useAssetPage } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { useAssetDeletion, useAssetGroupActions } from '../../-assetEditorStates';
import { compositionTiles, DUPLICATED_TILE_CAP, omissionNote } from './-composition';
import styles from './index.module.css';

type AssetPage = NonNullable<AssetPageData>;

export const Route = createFileRoute('/_app/assets/$type/$slug/')({
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  /* The container grid's one view choice.
   * Absent is the default, every copy;
   * only the collapsed state reaches the URL, the browse page's absence-is-default rule. */
  validateSearch: (input: Record<string, unknown>): { copies?: 'once' } =>
    input.copies === 'once' ? { copies: 'once' } : {},
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
 * The words `PageMessage` wears on this route: the asset type's own name, and a way back to that type's browse page.
 * A local component rather than a repeated prop because the type is a route param and every message on this page reads it.
 * An unknown type still gets a frame, since the loader's `notFound` throw has to land somewhere.
 */
function AssetDetailMessage({ children }: { children: ReactNode }) {
  const { type } = Route.useParams();
  const label = isAssetType(type) ? ASSET_TYPES[type].label : 'Assets';
  return (
    <PageMessage
      title={label}
      back={
        <PageMessage.Back to="/assets/$type" params={{ type }}>
          Back to {label.toLowerCase()}
        </PageMessage.Back>
      }
    >
      {children}
    </PageMessage>
  );
}

function AssetDetailPending() {
  return (
    <AssetDetailMessage>
      <LoadPending title="Loading">This asset is still loading.</LoadPending>
    </AssetDetailMessage>
  );
}

function AssetDetailError({ error }: ErrorComponentProps) {
  return (
    <AssetDetailMessage>
      <LoadError title="This asset could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
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

/**
 * The containers of one kind that hold this asset, or a line saying there are none.
 *
 * One component for decks and bundles, because "which containers hold this" is one question asked twice, and `containersHolding` already answers it with one query and a different kind literal.
 * A count above one is shown as a multiplier: a deck holding three copies of a card and a bundle holding twenty of a token are the same statement (see CONTEXT.md: Bundle).
 */
function ContainerSection({
  id,
  title,
  empty,
  containers,
  icon,
}: {
  id: string;
  title: string;
  empty: string;
  containers: AssetPage['inDecks'];
  icon: ReactNode;
}) {
  return (
    <Section id={id} icon={icon} title={title}>
      {containers.length === 0 ? (
        <Surface padding="lg">
          <Text size="sm" c="dimmed">
            {empty}
          </Text>
        </Surface>
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
    </Section>
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
                Cardback from <AssetLink type={backDeck.type} slug={backDeck.slug} name={backDeck.name} />
              </>
            ) : undefined
          }
        >
          {backDeck ? (
            <AssetFace type="deck" data={backDeck.data} name={backDeck.name} />
          ) : danglingDeck && page.resolvedBack?.href ? (
            /* The note below carries the words, so the image is decorative to a screen reader. */
            <img src={page.resolvedBack.href} alt="" className={styles.fallbackCardback} />
          ) : (
            /* A deck's cards reach `AssetFace` here too and are ignored, which is that prop's documented contract rather than an accident. */
            <AssetFace
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
  /* One image, one caption: same-mode is double-sided by choice, a dangling reference by fallback, and stacking two identical renders said nothing twice (Norbert, 2026-08-21). */
  if (back?.mode === 'same' || dangling) {
    return (
      <Stack gap="sm" align="center">
        <FaceStage caption="Front & back">
          <AssetFace type={asset.type} data={asset.data} name={asset.name} side="front" />
        </FaceStage>
        {dangling ? (
          <Text size="sm" c="dimmed">
            The back this token referenced is gone, so it shows its front on both sides.
          </Text>
        ) : null}
      </Stack>
    );
  }
  return (
    <Stack gap="lg" align="center">
      <FaceStage caption="Front">
        <AssetFace type={asset.type} data={asset.data} name={asset.name} side="front" />
      </FaceStage>
      {back?.mode === 'reference' && backToken ? (
        <FaceStage
          caption={
            <>
              Back: <AssetLink type={backToken.type} slug={backToken.slug} name={backToken.name} />
            </>
          }
        >
          <AssetFace type={backToken.type} data={backToken.data} name={backToken.name} side="back" />
        </FaceStage>
      ) : (
        <FaceStage caption="Back">
          <AssetFace type={asset.type} data={asset.data} name={asset.name} side="back" />
        </FaceStage>
      )}
    </Stack>
  );
}

/** Prose the face cannot carry. An empty About says so rather than vanishing: the field is part of the page, and its absence was read as the page missing it (Norbert, 2026-08-21). */
function AboutSection({ about }: { about: string }) {
  return (
    <Section id="about" icon={<TopicIcon topic="about" size={20} />} title="About">
      <Surface padding="lg">
        {about.trim() ? (
          <FormattedTextSource source={about} />
        ) : (
          <Text size="sm" c="dimmed">
            Nothing written about this yet.
          </Text>
        )}
      </Surface>
    </Section>
  );
}

/**
 * What a container holds, drawn rather than listed: a grid of member previews, each tile a link to the member's own page.
 * The container's matter is its members, not its band or back (Norbert, 2026-08-22).
 * Read-only here;
 * composition is managed in the container's editor.
 * One component for decks and bundles, because a deck's cards and a bundle's tokens are the same relation read.
 *
 * `duplicated` draws one tile per copy, the deck as it physically stacks, while the collapsed view draws each member once with its count on the caption.
 * The per-copy expansion is bounded, and the collapsed view never is: the arithmetic and its note live in the composition module, where they are testable without a mounted renderer.
 */

function Composition({
  members,
  truncated,
  noun,
  duplicated,
}: {
  members: AssetPage['members'];
  truncated: boolean;
  noun: string;
  duplicated: boolean;
}) {
  const { tiles, omittedCopies, omittedMembers } = compositionTiles(members, { duplicated });
  const note = omissionNote({
    duplicated,
    cap: DUPLICATED_TILE_CAP,
    omittedCopies,
    omittedMembers,
    serverTruncated: truncated,
    loadedMembers: members.length,
    noun,
  });
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
          <TileGrid>
            {tiles.map(({ member, key, count }) => (
              <OpenableTile
                key={key}
                caption={count > 1 ? `${member.name} ×${count}` : member.name}
                renderRoot={(rootProps) => (
                  <Link {...rootProps} to="/assets/$type/$slug" params={{ type: member.type, slug: member.slug }} />
                )}
              >
                <AssetFace type={member.type} data={member.data} name={member.name} />
              </OpenableTile>
            ))}
          </TileGrid>
          {note ? (
            <Text size="sm" c="dimmed">
              {note}
            </Text>
          ) : null}
        </>
      )}
    </Section>
  );
}

/**
 * The rulesets that ship this container, and the slot each one puts it in: a rail card beside the preview (Norbert, 2026-08-22).
 *
 * Read-only here.
 * Slots are managed on the ruleset edit page, per «Ruleset deck-slot residual semantics», so this card links out rather than offering an action.
 * It renders nothing at all when there are none, the way About's old shape did: "no ruleset uses this yet" is not a fact worth a heading.
 */
function ShippedByCard({ rulesets }: { rulesets: AssetPage['linkingRulesets'] }) {
  if (rulesets.length === 0) {
    return null;
  }
  return (
    <Card title="Shipped by" icon={<TopicIcon topic="rulesets" size={18} />}>
      <Links>
        {rulesets.map((ruleset) => (
          <Links.Item key={ruleset.id} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: ruleset.slug }}>
            {`${ruleset.name} · ${slotLabel(ruleset.slot)}`}
          </Links.Item>
        ))}
      </Links>
    </Card>
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
/* This table doubles as the container registry: a type listed here also gets the slim rail and the rail-side Shipped by. A future type wanting a body region without the container arrangement needs the registry split first. */
const PER_TYPE_BODY: Record<string, (page: AssetPage, duplicated: boolean) => ReactNode> = {
  /* Both container types lead with the grid; who ships them moved to the rail with the preview (Norbert, 2026-08-22). */
  deck: (page, duplicated) => (
    <Composition members={page.members} truncated={page.membersTruncated} noun="cards" duplicated={duplicated} />
  ),
  bundle: (page, duplicated) => (
    <Composition members={page.members} truncated={page.membersTruncated} noun="tokens" duplicated={duplicated} />
  ),
};

/** Which types the container arrangement applies to: grid-led body, slim rail. Derived from the body table rather than restated. */
function isContainerType(type: string): boolean {
  return type in PER_TYPE_BODY;
}

function AssetDetailBody({ page, duplicated }: { page: AssetPage; duplicated: boolean }) {
  const about =
    typeof (page.asset.data as { about?: unknown })?.about === 'string'
      ? (page.asset.data as { about: string }).about
      : '';
  return (
    <Stack gap="lg">
      {PER_TYPE_BODY[page.asset.type]?.(page, duplicated)}
      {/* Membership reads with the other facts rather than beside the render: the rail is the preview's, the column is the reader's (Norbert, 2026-08-21). */}
      {holdsDeckMembership(page.asset.type) ? (
        <ContainerSection
          id="in-decks"
          title="In decks"
          empty="Not in any deck yet."
          containers={page.inDecks}
          icon={<Layers3 size={20} aria-hidden />}
        />
      ) : null}
      {page.asset.type.startsWith('token-') ? (
        <ContainerSection
          id="in-bundles"
          title="In bundles"
          empty="Not in any bundle yet."
          containers={page.inBundles}
          icon={<Boxes size={20} aria-hidden />}
        />
      ) : null}
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
        <NotAvailable title="Asset not found">
          This asset does not exist or was deleted. Renaming an asset re-slugs its URL, so an old link may have moved.
        </NotAvailable>
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
  const { asset, viewerAccess, assignableGroups, inDecks, assetPublishing, backPublishing } = page;
  const groupActions = useAssetGroupActions({ asset, access: { viewerAccess, assignableGroups } });
  const deletion = useAssetDeletion(asset);
  const { copies } = Route.useSearch();
  const navigate = Route.useNavigate();
  const container = isContainerType(asset.type);
  const duplicated = copies !== 'once';
  /* Only a container holding an actual multiple offers the toggle: with every count at one, the two views are the same picture. */
  const hasCopies = container && page.members.some(({ count }) => count > 1);
  const memberNoun = asset.type === 'deck' ? 'card' : 'token';
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
            <AssetFace type={asset.type} data={asset.data} name={asset.name} />
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
              {/* The band carries the page's statistics, the ruleset band's pattern (Norbert, 2026-08-21). */}
              <Stats
                orientation="row"
                items={[
                  {
                    key: 'created',
                    icon: <CalendarPlus size={17} aria-hidden />,
                    value: formatRelativeDate(asset.created_at),
                    label: `Created ${formatRelativeDate(asset.created_at)}`,
                  },
                  {
                    key: 'updated',
                    icon: <History size={17} aria-hidden />,
                    value: formatRelativeDate(asset.updated_at),
                    label: `Updated ${formatRelativeDate(asset.updated_at)}`,
                  },
                  /* Only for types a deck can hold; the payload already carries the list for the In-decks section. */
                  ...(holdsDeckMembership(asset.type)
                    ? [
                        {
                          key: 'decks',
                          icon: <Layers3 size={17} aria-hidden />,
                          value: inDecks.length,
                          label: `In ${inDecks.length} ${inDecks.length === 1 ? 'deck' : 'decks'}`,
                        },
                      ]
                    : []),
                ]}
              />
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
              {/* Every copy or each once: the grid's one view choice, for decks stacking multiples (Norbert, 2026-08-22). */}
              {hasCopies ? (
                <IconAction
                  label={duplicated ? `Show each ${memberNoun} once` : 'Show every copy'}
                  variant={duplicated ? 'light' : 'filled'}
                  color="gray"
                  size="lg"
                  icon={<Copy size={17} aria-hidden />}
                  onClick={() =>
                    void navigate({
                      /* Functional, the browse controls' shape: a future search param must survive the toggle, and an undefined value is how absence-is-default is spelled. */
                      search: (previous) => ({ ...previous, copies: duplicated ? ('once' as const) : undefined }),
                      replace: true,
                    })
                  }
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
        {/* The reading matter leads and the render stands in a rail beside it, the edit pages' arrangement (Norbert, 2026-08-21).
            A container's rail slims to a band: its matter is the member grid, and the preview keeps the rail company with Shipped by (Norbert, 2026-08-22). */}
        <AsymmetricSplitLayout rail={container ? 'slim' : 'reading'}>
          <AsymmetricSplitLayout.Wide>
            <AssetDetailBody page={page} duplicated={duplicated} />
          </AsymmetricSplitLayout.Wide>

          <AsymmetricSplitLayout.Narrow>
            <Stack gap="lg">
              <AssetFaces page={page} />
              {container ? <ShippedByCard rulesets={page.linkingRulesets} /> : null}
              {assignedGroup ? (
                <Card title="Maintained by" icon={<UsersRound size={18} aria-hidden />}>
                  <GroupLink slug={assignedGroup.slug} name={assignedGroup.name} />
                </Card>
              ) : null}
            </Stack>
          </AsymmetricSplitLayout.Narrow>
        </AsymmetricSplitLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}

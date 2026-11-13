import {
  Accordion,
  Box,
  ColorSwatch,
  Divider,
  Flex,
  Group,
  List,
  Popover,
  Radio,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { factionSpecialRuleLabel } from '@shared/factions/specialRule';
import { TREACHERY_TRACKER_RULE } from '@shared/factions/treacheryTrackerRule';
import { lacksBattleValues, troopBattleFaces } from '@shared/factions/troopBattle';
import type { TroopFaceBattleValues } from '@shared/factions/troopBattle';
import { INHERITABLE_FIELDS } from '@shared/factions/variantFields';
import { slugify } from '@shared/slugify';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { Notice } from '@ui/block/Notice';
import { PageIdentity } from '@ui/block/PageIdentity';
import { Section } from '@ui/block/Section';
import { factionAssetPublishingCopy } from '@ui/content/assetPublishingStatus';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { complexityOutOfTen, complexityTier, effectiveComplexity } from '@ui/content/complexity';
import { COMPLEXITY_TIER_PRESENTATION, ComplexityGlyph } from '@ui/content/ComplexityGlyph';
import { EmptyNote } from '@ui/content/EmptyNote';
import { FormattedTextSource, InlineFormattedTextSource } from '@ui/content/FormattedText';
import { Pending } from '@ui/content/Pending';
import { RulesetLink } from '@ui/content/RulesetLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import type { StatusBadgeTone } from '@ui/content/StatusBadge';
import { StatusMark } from '@ui/content/StatusMark';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { EntityLinkList } from '@ui/list/EntityLinkList';
import type { StatsItem } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { Download, Eye, FileText, GitBranchPlus, Pencil, TriangleAlert, UserPlus } from 'lucide-react';
import { Fragment, useId, useReducer, useState } from 'react';
import type { ReactNode } from 'react';

import { mutationErrorMessage } from '@db/core/mutationError';
import {
  isFactionNotFound,
  loadPublicFactionDetail,
  useCreateFactionVariant,
  useFactionDetail,
  useFactionVariantContext,
} from '@db/factions';
import type { FactionData, FactionDetailPageData, PublicAssetPublishingStatusProjection } from '@db/factions';
import { useGroupMembershipWorkflow } from '@db/members';
import { profileAvatarUrl } from '@db/profiles';
import { redirectFromFormerAddress, redirectToOwnFactionAddress } from '@app/routes/formerAddress';
import { profileLink, publicDescription, publicPageHead, useLivePageTitle } from '@app/routes/publicPage';
import { detailError } from '@app/routes/routeStates';
import { factionAuthoringWarnings } from '@app/widgets/faction-editor/factionAuthoringContract';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';
import { RelatedFaq } from '@app/widgets/related-faq/RelatedFaq';
import { useAsset } from '@game/assets/assetRenderMode';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token as FactionToken } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { BackgroundLibrary } from '@game/assets/utils/BackgroundLibrary';
import { TTS_COLOR_SWATCHES } from '@game/data/ttsColors';

import { useFactionEditRights } from '../useFactionEditRights';
import styles from './index.module.css';

const FACTION_KIND = 'Custom faction';

const backToFactions = <PageMessage.Back to="/factions">Back to factions</PageMessage.Back>;

export const Route = createFileRoute('/_app/factions/$factionId/')({
  ssr: true,
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  loader: async ({ params, location }) => {
    const page = await loadPublicFactionDetail(params.factionId);
    if (!page) {
      await redirectFromFormerAddress({ kind: 'faction', slug: params.factionId }, location);
      throw notFound();
    }
    redirectToOwnFactionAddress(params.factionId, page.faction.slug, location);
    return page;
  },
  pendingComponent: FactionDetailPending,
  errorComponent: detailError({ noun: 'faction', isMissing: isFactionNotFound, back: backToFactions, renamed: true }),
  head: ({ match, loaderData, params }) =>
    publicPageHead({
      name: loaderData?.faction.data.name ?? 'Faction',
      kind: loaderData ? FACTION_KIND : undefined,
      pathname: `/factions/${encodeURIComponent(loaderData?.faction.slug ?? params.factionId)}`,
      description: loaderData
        ? publicDescription(loaderData.faction.data.rules.advantages[0]?.text) ||
          'Read its rules, leaders and troops, and print its faction sheet.'
        : '',
      image: loaderData ? publishedHref('faction-token', loaderData.faction._id, loaderData.faction.updated_at) : null,
      social: { shape: 'round' },
      trail: [{ name: 'Factions', pathname: '/factions' }],
      entity: { type: 'work', author: profileLink(loaderData?.owner) },
      match,
    }),
  component: FactionDetailPage,
});

function FactionDetailPending() {
  return (
    <RoutePending size="compact" title="Faction" back={backToFactions} loading="Loading faction">
      The faction details are still loading.
    </RoutePending>
  );
}

function FactionSidebarOverview({ data }: { data: FactionData }) {
  return (
    <Section icon={<TopicIcon topic="factionLeader" size={20} />} title="Faction leader">
      <div className={styles.loreFactionLeaderToken}>
        <LeaderToken {...data.factionLeader} strength={undefined} background={data.background} emblem={data.emblem} />
      </div>
    </Section>
  );
}

function FactionPlanet({ planet }: { readonly planet: NonNullable<FactionData['planet']>[number] }) {
  const image = useAsset(planet.image, 'small');
  const descriptionId = useId();
  const hasDescription = planet.description.trim().length > 0;
  const description = <FormattedTextSource source={planet.description} size="sm" />;

  return (
    <Tooltip
      label={description}
      disabled={!hasDescription}
      position="left"
      middlewares={{ flip: { fallbackPlacements: ['top', 'bottom'] } }}
      multiline
      maw={280}
      withArrow
      events={{ hover: true, focus: true, touch: true }}
    >
      <Group
        component="li"
        wrap="nowrap"
        gap="sm"
        aria-label={planet.name}
        aria-describedby={hasDescription ? descriptionId : undefined}
        tabIndex={hasDescription ? 0 : undefined}
        style={{ cursor: hasDescription ? 'help' : undefined }}
      >
        <img src={image} alt="" width={64} height={64} className={styles.planetArt} />
        <Text fw={700} miw={0} style={{ overflowWrap: 'anywhere' }}>
          {planet.name}
        </Text>
        {hasDescription ? (
          <div hidden id={descriptionId}>
            {description}
          </div>
        ) : null}
      </Group>
    </Tooltip>
  );
}

type Troop = FactionData['troops'][number];
type TroopFace = TroopFaceBattleValues<NonNullable<Troop['back']>>;

function troopFaceName(face: TroopFace): string {
  return `${face.face.name}${face.side === 'back' ? ', reverse side' : ''}`;
}

/**
 * Everything wrong with the variant on the page, as sentences.
 * What a parent's change left comes first, in the server's words, because a save is refused until it is fixed.
 * After it come the troop sides without battle strengths, then the blanks the editor warns about.
 */
function variantProblemList(faction: FactionDetailPageData['faction']): { fromParent: string[]; all: string[] } {
  const fromParent = faction.problems ?? [];
  const withoutStrengths = troopBattleFaces(faction.data.troops)
    .filter(lacksBattleValues)
    .map(
      (face) =>
        `${troopFaceName(face).trim() || `Troop ${face.troopIndex + 1}`}: battle strengths have not been set, so this side is unavailable in battle plans.`
    );
  const blanks = factionAuthoringWarnings(faction.data).map((warning) => `${warning.label}.`);
  return { fromParent, all: [...fromParent, ...withoutStrengths, ...blanks] };
}

function TroopHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip label={label} multiline maw={280} withArrow events={{ hover: true, focus: true, touch: true }}>
      <Box component="span" className={styles.troopHint} role="img" tabIndex={0} aria-label={label}>
        {children}
      </Box>
    </Tooltip>
  );
}

function TroopStrengths({ face }: { face: TroopFace }) {
  if (!face.capable) {
    return <StatusMark label="Cannot participate in battle" icon={<TopicIcon topic="cannotBattle" size={15} />} />;
  }
  /* The same question the problems notice asks, so the mark and the notice cannot disagree. */
  if (lacksBattleValues(face) || face.values === null) {
    return (
      <StatusMark
        tone="caution"
        label="Battle strengths have not been set. This side is unavailable in battle plans."
        icon={<TopicIcon topic="battleUnknown" size={16} />}
      />
    );
  }
  return (
    <>
      <TroopHint
        label={`Strength per troop: ${face.values.strength} unsupported | ${face.values.supportedStrength} supported`}
      >
        <TopicIcon topic="strength" size={15} />
        <b>
          {face.values.strength} | {face.values.supportedStrength}
        </b>
      </TroopHint>
      <TroopHint label={`Support cost: ${face.values.supportCost} spice per supported troop`}>
        <TopicIcon topic="spice" size={15} />
        <b>{face.values.supportCost}</b>
      </TroopHint>
    </>
  );
}

function TroopFaceDetails({ face, background }: { face: TroopFace; background: FactionData['background'] }) {
  const descriptionId = useId();
  const name = troopFaceName(face);
  const hasDescription = face.face.description.trim().length > 0;
  const description = <FormattedTextSource source={face.face.description} size="sm" />;
  return (
    <div className={styles.troopFace}>
      {hasDescription ? (
        <div hidden id={descriptionId}>
          {description}
        </div>
      ) : null}
      <Tooltip
        label={
          <Stack gap="xs">
            <Text size="sm" fw={700}>
              {name}
            </Text>
            {hasDescription ? description : null}
          </Stack>
        }
        multiline
        maw={280}
        withArrow
        events={{ hover: true, focus: true, touch: true }}
      >
        <Box
          component="span"
          className={styles.troopHint}
          role="img"
          tabIndex={0}
          aria-label={name}
          aria-describedby={hasDescription ? descriptionId : undefined}
        >
          <span className={styles.troopToken} aria-hidden>
            <TroopToken
              background={background}
              image={face.face.image}
              hue={face.face.hue}
              star={face.face.star}
              striped={face.face.striped}
            />
          </span>
        </Box>
      </Tooltip>
      <Stack gap="xs" className={styles.troopFaceContent}>
        <Text size="sm" fw={700} lh={1.2} truncate>
          {face.face.name}
        </Text>
        <Group gap="xs">
          <TroopStrengths face={face} />
        </Group>
      </Stack>
    </div>
  );
}

function FactionTroop({ troop, background }: { troop: Troop; background: FactionData['background'] }) {
  const faces = troopBattleFaces<NonNullable<Troop['back']>>([troop]);
  return (
    <Surface as="article" aria-label={troop.name} padding="sm" className={styles.troopTile}>
      <div className={styles.troopFaces}>
        {faces.map((face) => (
          <Fragment key={face.id}>
            {face.side === 'back' ? (
              <div className={styles.troopFlipDivider}>
                <Divider orientation="vertical" />
                <TroopHint label={`Flip side: ${face.face.name}`}>
                  <TopicIcon topic="flip" size={16} />
                </TroopHint>
                <Divider orientation="vertical" />
              </div>
            ) : null}
            <TroopFaceDetails face={face} background={background} />
          </Fragment>
        ))}
        <span className={styles.troopCount}>
          <TroopHint label={`${troop.count} ${troop.count === 1 ? 'troop token' : 'troop tokens'}`}>
            <Text component="span" size="xs" c="dimmed">
              ×{troop.count}
            </Text>
          </TroopHint>
        </span>
      </div>
    </Surface>
  );
}

function FactionLeader({
  leader,
  background,
  emblem,
}: {
  leader: FactionData['leaders'][number];
  background: FactionData['background'];
  emblem: FactionData['emblem'];
}) {
  const label = `${leader.name}, strength ${leader.strength ?? 'not specified'}`;
  return (
    <Tooltip label={label}>
      <article className={styles.leaderTile} aria-label={label}>
        <LeaderToken {...leader} background={background} emblem={emblem} />
      </article>
    </Tooltip>
  );
}

/**
 * The Files card's badge for the faction sheet.
 * A failed replacement leaves the publication it replaces in place (CONTEXT.md, Asset publication state), but every viewer is told the update failed (#1385).
 * With no sheet published yet nothing was being updated, so the badge says the publish failed.
 */
function filesBadge({ status, captureStatus }: PublicAssetPublishingStatusProjection): {
  tone: StatusBadgeTone;
  label: string;
} {
  switch (captureStatus) {
    case 'in_progress':
      return { tone: 'progress', label: 'In progress' };
    case 'scheduled':
      return { tone: 'pending', label: 'Scheduled' };
    case 'error':
      return { tone: 'negative', label: status === 'current' ? 'Update failed' : 'Publish failed' };
    case null:
      return status === 'current' ? { tone: 'positive', label: 'Current' } : { tone: 'neutral', label: 'Unavailable' };
  }
}

function FactionTroops({
  troops,
  background,
}: {
  troops: FactionData['troops'];
  background: FactionData['background'];
}) {
  return (
    <Section icon={<TopicIcon topic="troops" size={20} />} title="Troops">
      <Group gap="sm" align="flex-start">
        {troops.map((troop, index) => (
          <FactionTroop key={troop.troopId ?? index} troop={troop} background={background} />
        ))}
      </Group>
    </Section>
  );
}

function FactionAdvantages({ advantages }: { advantages: FactionData['rules']['advantages'] }) {
  return (
    <Section icon={<TopicIcon topic="advantages" size={20} />} title="Advantages">
      {advantages.length > 0 ? (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {advantages.map((advantage, index) => (
            <Card
              key={`${advantage.title ?? 'advantage'}-${advantage.text}-${index}`}
              title={advantage.title ?? `Advantage ${index + 1}`}
            >
              <Stack gap="sm">
                <FormattedTextSource source={advantage.text} size="sm" />
                {advantage.karama ? (
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    <TopicIcon topic="karama" size={16} />
                    <FormattedTextSource source={advantage.karama} size="sm" tone="neutral" />
                  </Group>
                ) : null}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <EmptyNote>No faction advantages have been added yet.</EmptyNote>
      )}
    </Section>
  );
}

function FactionSpecialRule({ rule }: { rule: FactionData['rules']['fate'] }) {
  return (
    <Card
      icon={<TopicIcon topic={rule.label === 'fate' ? 'fate' : 'karama'} size={20} />}
      title={factionSpecialRuleLabel(rule.label)}
    >
      {rule.title ? (
        <Section title={rule.title}>
          <FormattedTextSource source={rule.text} size="sm" />
        </Section>
      ) : (
        <FormattedTextSource source={rule.text} size="sm" />
      )}
    </Card>
  );
}

const NO_PARENT = 'none';

type VariantDraft = { name: string; parent: string };

type VariantDraftEvent = { type: 'named'; name: string } | { type: 'parentChosen'; parent: string };

function variantDraftReducer(draft: VariantDraft, event: VariantDraftEvent): VariantDraft {
  switch (event.type) {
    case 'named':
      return { ...draft, name: event.name };
    case 'parentChosen':
      return { ...draft, parent: event.parent };
  }
}

type VariantFaction = FactionDetailPageData['faction'];

/**
 * Starts a new variant of the page's Faction from the toolbar (#2927).
 * The form mounts with the popover, so the Faction's variants are read only while it is open.
 */
function CreateVariantPopover({ faction }: Readonly<{ faction: VariantFaction }>) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" width={340} withArrow trapFocus>
      <Popover.Target>
        <Box component="span" display="inline-flex">
          <IconAction
            label="Create variant"
            emphasis="standard"
            intent="positive"
            size="lg"
            pressed={opened}
            onClick={() => setOpened((current) => !current)}
            icon={<GitBranchPlus size={17} aria-hidden />}
          />
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <CreateVariantForm faction={faction} />
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * The new variant's name, the address that name gives it, and the one parent it may follow.
 * The variant on the page is the parent offered first, and the one a variant without a parent starts as a copy of.
 */
function CreateVariantForm({ faction }: Readonly<{ faction: VariantFaction }>) {
  const navigate = Route.useNavigate();
  const createVariant = useCreateFactionVariant();
  const context = useFactionVariantContext(faction._id);
  const [draft, dispatch] = useReducer(variantDraftReducer, { name: '', parent: faction._id });
  if (!context) {
    return <Pending>Loading variants</Pending>;
  }
  const parent = context.variants.find((variant) => variant._id === draft.parent);
  const variantSlug = slugify(draft.name);
  const create = async () => {
    if (!variantSlug || createVariant.isPending) {
      return;
    }
    const created = await createVariant
      .mutateAsync({ factionId: faction._id, name: draft.name, parentId: parent?._id ?? null })
      .catch(() => null);
    if (created) {
      void navigate({ to: '/factions/$factionId', params: { factionId: created.slug } });
    }
  };

  return (
    <form
      aria-label="Create variant"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <Stack gap="md">
        <ControlBlock
          title="Variant name"
          description={`What sets this variant apart from the others.\nIt is always shown beside ${faction.data.name}, so leave that name out.`}
          input={(control) => (
            <TextInput
              {...control}
              data-autofocus
              placeholder="e.g. Homebrew, Tournament rules"
              value={draft.name}
              onChange={(event) => dispatch({ type: 'named', name: event.currentTarget.value })}
            />
          )}
        />
        <Text size="xs" c="dimmed">
          Address:{' '}
          <Text span ff="monospace" size="xs">
            {`/factions/${context.familySlug}-${variantSlug || '…'}`}
          </Text>
        </Text>
        <ControlBlock
          title="Parent variant"
          description="The parent is chosen once and cannot be changed later."
          input={
            <Radio.Group
              value={parent ? parent._id : NO_PARENT}
              onChange={(value) => dispatch({ type: 'parentChosen', parent: value })}
            >
              <Stack gap="xs">
                <Radio value={NO_PARENT} label="No parent" color="selected" />
                {context.variants.map((variant) => (
                  <Radio key={variant._id} value={variant._id} label={variant.name} color="selected" />
                ))}
              </Stack>
            </Radio.Group>
          }
        />
        <Text size="xs" c="dimmed">
          {parent
            ? `Starts with all ${INHERITABLE_FIELDS.length} fields using ${parent.name}. Untick Use parent variant on any of them in the editor to make it custom.`
            : `Starts as a copy of ${faction.variant_name ?? 'this variant'}, with every field its own. A variant without a parent can never be given one.`}
        </Text>
        {createVariant.error ? (
          <FormError title="Variant could not be created">{mutationErrorMessage(createVariant.error)}</FormError>
        ) : null}
        <Group justify="flex-end">
          <LabeledAction
            type="submit"
            intent="positive"
            emphasis="strong"
            busy={createVariant.isPending}
            disabledReason={variantSlug ? undefined : 'Give the variant a name.'}
            icon={<GitBranchPlus size={16} />}
          >
            Create variant
          </LabeledAction>
        </Group>
      </Stack>
    </form>
  );
}

/**
 * Everything the variant's editors have to fix, in one notice above the page (#2908).
 * It is one line until pressed, because it is an extra on a page that is about the faction, and the way to the editor is the toolbar's Edit.
 */
function VariantProblemsNotice({
  page,
  problems,
}: Readonly<{ page: FactionDetailPageData; problems: ReturnType<typeof variantProblemList> }>) {
  const count = problems.all.length === 1 ? '1 problem' : `${problems.all.length} problems`;
  const variantName = page.faction.variant_name ?? 'This variant';
  /* Only the variant's editors see this notice, and the parent's name is theirs to ask for. */
  const parentName = useFactionVariantContext(page.faction._id)?.parent?.name ?? 'its parent variant';
  const fromParent = problems.fromParent.length;
  return (
    <Notice tone="caution">
      <Accordion
        classNames={{
          item: styles.problemsItem,
          control: styles.problemsControl,
          label: styles.problemsLabel,
          content: styles.problemsContent,
        }}
      >
        <Accordion.Item value="problems">
          <Accordion.Control>
            <Text inherit truncate>{`${count} to fix in this variant`}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">
                {`${variantName} is not ready for play until these are fixed.`}
                {fromParent > 0
                  ? ` The first ${fromParent === 1 ? 'one came' : `${fromParent} came`} from changes to ${parentName}, and the variant cannot be saved until ${fromParent === 1 ? 'it is' : 'they are'} fixed.`
                  : null}
              </Text>
              <List size="sm" spacing="xs" aria-label="Problems">
                {problems.all.map((problem, index) => (
                  <List.Item key={`${problem}-${index}`}>{problem}</List.Item>
                ))}
              </List>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Notice>
  );
}

function FactionDetailPage() {
  const { factionId } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const factionSeed = loaderData;

  const factionQuery = useFactionDetail(factionId, {
    initialData: factionSeed,
  });
  const membershipWorkflow = useGroupMembershipWorkflow();
  const page = factionQuery.data;
  useLivePageTitle(page?.faction.data.name, FACTION_KIND);

  if (!page) {
    return <FactionDetailPending />;
  }

  return (
    <BackgroundLibrary presets={page.backgrounds} fronts={page.cardFrontPresets}>
      <FactionDetailContent
        faq={factionQuery}
        factionId={factionId}
        page={page}
        isPending={factionQuery.isPending}
        membershipWorkflow={membershipWorkflow}
      />
    </BackgroundLibrary>
  );
}

function FactionDetailContent({
  faq,
  factionId,
  page,
  isPending,
  membershipWorkflow,
}: {
  faq: ReturnType<typeof useFactionDetail>;
  factionId: string;
  page: FactionDetailPageData;
  isPending: boolean;
  membershipWorkflow: ReturnType<typeof useGroupMembershipWorkflow>;
}) {
  const navigate = Route.useNavigate();
  const { resolved, viewerAccess, rights, canOpenEditor } = useFactionEditRights(page);
  const { faction, owner, assetPublishing } = page;

  /* The shared page usually settles before the viewer does; controls wait for both. */
  const settled = !isPending && resolved;
  const canEdit = settled && canOpenEditor;
  /* Adding a variant is the Faction's maintainers' to do, and a variant's problems are for whoever may edit it. */
  const canCreateVariant = settled && rights.shared && page.family !== null;
  const problems = variantProblemList(faction);
  const showsProblems = settled && rights.variant && problems.all.length > 0;
  /* A reader who cannot fix the problems is told only that there are some. */
  const showsNotReady = settled && !rights.variant && problems.all.length > 0;
  const canRequestMembership = settled && viewerAccess.capabilities.requestMembership;
  const assignedGroup = viewerAccess.assignedGroup;
  const membershipStatus = viewerAccess.viewer.kind === 'authenticated' ? viewerAccess.viewer.membership : 'none';

  const data = faction.data;
  const planets = data.planet ?? [];
  const troopCount = data.troops.reduce((total, troop) => total + troop.count, 0);
  const complexity = effectiveComplexity(data.complexity);
  /**
   * Standing beside the maintaining group, and only when the viewer has a standing worth naming.
   * "Not a member" is the default state of every reader, so saying it would be noise.
   */
  const membershipBadge =
    membershipStatus === 'active'
      ? ({ tone: 'positive', label: 'Member' } as const)
      : membershipStatus === 'pending'
        ? ({ tone: 'pending', label: 'Pending' } as const)
        : null;
  /** The counts the header carries; the rulesets stay a list of links in the content. */
  const headerStats: StatsItem[] = [
    {
      key: 'complexity',
      icon: <ComplexityGlyph score={complexity} size={17} decorative />,
      value: `${complexityOutOfTen(complexity)}/10`,
      label: `Complexity ${complexityOutOfTen(complexity)}/10 · ${COMPLEXITY_TIER_PRESENTATION[complexityTier(complexity)].label}`,
    },
    {
      key: 'leaders',
      icon: <TopicIcon topic="leaders" size={17} />,
      value: data.leaders.length,
      label: `${data.leaders.length} ${data.leaders.length === 1 ? 'leader' : 'leaders'}`,
    },
    {
      key: 'troops',
      icon: <TopicIcon topic="troops" size={17} />,
      value: troopCount,
      label: `${troopCount} ${troopCount === 1 ? 'troop' : 'troops'}`,
    },
    {
      key: 'spice',
      icon: <TopicIcon topic="spice" size={17} />,
      value: data.rules.spiceCount,
      label: `${data.rules.spiceCount} spice`,
    },
  ];
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageIdentity
          title={data.name}
          media={
            <div className={styles.factionSymbol} role="img" aria-label={`${data.name} symbol`}>
              <FactionToken emblem={data.emblem} background={data.background} />
            </div>
          }
          breadcrumb={<Breadcrumb to="/factions">Factions</Breadcrumb>}
          maintainers={{
            owner: owner ? { slug: owner.slug, name: owner.username, image: profileAvatarUrl(owner) } : null,
            group: assignedGroup ? { slug: assignedGroup.slug, name: assignedGroup.name } : null,
          }}
          standing={membershipBadge}
          stats={headerStats}
        >
          {showsNotReady ? (
            <Tooltip
              label="This variant has problems its maintainers still need to fix."
              multiline
              maw={280}
              withArrow
              events={{ hover: true, focus: true, touch: true }}
            >
              <Box component="span" display="inline-flex" tabIndex={0}>
                <StatusBadge tone="pending" icon={<TriangleAlert size={12} aria-hidden />}>
                  Not ready for play
                </StatusBadge>
              </Box>
            </Tooltip>
          ) : null}
        </PageIdentity>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left label="Navigation">
            {canEdit ? (
              <IconAction
                label="Edit faction"
                emphasis="standard"
                intent="neutral"
                size="lg"
                renderRoot={(rootProps) => (
                  <Link {...rootProps} to="/factions/$factionId/edit" params={{ factionId }} />
                )}
                icon={<Pencil size={17} aria-hidden />}
              />
            ) : null}
            {canCreateVariant ? <CreateVariantPopover key={faction._id} faction={faction} /> : null}
          </Toolbar.Left>

          <Toolbar.Right label="Faction actions">
            <Toolbar.Cluster kind="content">
              <IconAction
                label="Preview faction sheet"
                emphasis="standard"
                intent="neutral"
                size="lg"
                renderRoot={(rootProps) => (
                  <Link
                    {...rootProps}
                    to="/preview/sheet/$factionSlug"
                    params={{ factionSlug: factionId }}
                    search={{ mode: 'db' }}
                    target="_blank"
                  />
                )}
                icon={<Eye size={17} aria-hidden />}
              />
              {assetPublishing.publicationHref ? (
                <IconAction
                  label="Open published PDF"
                  emphasis="standard"
                  intent="export"
                  size="lg"
                  href={assetPublishing.publicationHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<Download size={17} aria-hidden />}
                />
              ) : null}
            </Toolbar.Cluster>
            <Toolbar.Cluster kind="access">
              {canRequestMembership && assignedGroup ? (
                <IconAction
                  label="Request membership"
                  emphasis="standard"
                  intent="neutral"
                  size="lg"
                  loading={membershipWorkflow.request.isPending}
                  disabled={membershipWorkflow.request.isPending}
                  onClick={() => void membershipWorkflow.request.run(assignedGroup.id).catch(() => undefined)}
                  icon={<UserPlus size={17} aria-hidden />}
                />
              ) : null}
            </Toolbar.Cluster>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="xl">
          {showsProblems ? <VariantProblemsNotice page={page} problems={problems} /> : null}
          {membershipWorkflow.request.isError ? (
            <FormError title="Membership request failed">
              {membershipWorkflow.request.error?.message || 'Try again in a moment.'}
            </FormError>
          ) : null}
          {/* On a phone the faction itself (leaders, troops, advantages) comes first and the details follow it (Norbert, 2026-11-07). */}
          <Flex direction={{ base: 'column', md: 'row' }} gap="xl" align={{ base: 'stretch', md: 'flex-start' }}>
            <Box miw={0} style={{ flex: '1 1 auto' }}>
              <Stack gap="xl">
                <Section icon={<TopicIcon topic="leaders" size={20} />} title="Leaders">
                  <div className={styles.horizontalLane}>
                    {/* Position disambiguates: an author may field two identical leaders, and a
                    faction's lists carry no ids of their own. */}
                    {data.leaders.map((leader, index) => (
                      <FactionLeader
                        key={`${leader.name}-${leader.image}-${index}`}
                        leader={leader}
                        background={data.background}
                        emblem={data.emblem}
                      />
                    ))}
                  </div>
                </Section>

                <FactionTroops troops={data.troops} background={data.background} />

                <FactionAdvantages advantages={data.rules.advantages} />

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  <Card icon={<TopicIcon topic="alliance" size={20} />} title="Alliance">
                    <FormattedTextSource source={data.rules.alliance.text} size="sm" />
                  </Card>
                  <FactionSpecialRule rule={data.rules.fate} />
                </SimpleGrid>
              </Stack>
            </Box>

            <Stack
              gap="md"
              component="aside"
              aria-label="Faction details"
              w={{ base: '100%', md: '15rem' }}
              miw={0}
              style={{ flex: '0 0 auto' }}
            >
              <FactionSidebarOverview data={data} />

              {planets.length > 0 ? (
                <Section icon={<TopicIcon topic="planets" size={20} />} title="Planets">
                  <Stack component="ul" gap="sm" m={0} p={0} style={{ listStyle: 'none' }}>
                    {planets.map((planet, index) => (
                      <FactionPlanet key={`${planet.name}-${planet.image}-${index}`} planet={planet} />
                    ))}
                  </Stack>
                </Section>
              ) : null}

              <Section icon={<TopicIcon topic="setup" size={20} />} title="Setup">
                <Surface padding="lg">
                  <Stack gap="lg">
                    <Section title="Preferred TTS color">
                      {data.colors.length > 0 ? (
                        <Group gap="sm">
                          {data.colors.map((color) => (
                            <Tooltip key={color} label={`${color} TTS color`}>
                              <ColorSwatch
                                color={TTS_COLOR_SWATCHES[color]}
                                size={18}
                                aria-label={`${color} TTS color`}
                              />
                            </Tooltip>
                          ))}
                        </Group>
                      ) : (
                        <EmptyNote>None specified.</EmptyNote>
                      )}
                    </Section>
                    <Divider />
                    <Section title="At start">
                      <Text size="sm">
                        <InlineFormattedTextSource source={data.rules.startText} />
                      </Text>
                    </Section>
                    <Divider />
                    <Section title="Revival">
                      <Text size="sm">
                        <InlineFormattedTextSource source={data.rules.revivalText} />
                      </Text>
                    </Section>
                    <TreacheryTrackerSection keeps={data.rules.treacheryTracker} />
                  </Stack>
                </Surface>
              </Section>

              <FactionFilesAndRulesets page={page} />
            </Stack>
          </Flex>
          <RelatedFaq
            items={faq.relatedFaq}
            status={faq.faqStatus}
            onLoadMore={faq.loadMoreFaq}
            onOpenQuestion={(questionSlug, rulesetSlug) => {
              void navigate({ to: '/rulesets/$rulesetSlug/faq/$questionSlug', params: { questionSlug, rulesetSlug } });
            }}
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

function FactionFilesAndRulesets({ page }: { page: FactionDetailPageData }) {
  const { assetPublishing, rulesets } = page;
  const files = filesBadge(assetPublishing);
  return (
    <>
      <Card
        icon={<FileText size={20} aria-hidden />}
        title="Files"
        action={
          <StatusBadge live tone={files.tone}>
            {files.label}
          </StatusBadge>
        }
      >
        <Text size="sm" c="dimmed">
          {factionAssetPublishingCopy(assetPublishing.status, assetPublishing.captureStatus)}
        </Text>
      </Card>

      {/* Left out when empty, like the asset page's Shipped by card: an empty card only makes a new faction look unfinished. */}
      {rulesets.length > 0 ? (
        <Card icon={<TopicIcon topic="rulesets" size={20} />} title="Rulesets">
          <EntityLinkList>
            {rulesets.map((ruleset) => (
              <RulesetLink key={ruleset.id} slug={ruleset.slug} name={ruleset.name} />
            ))}
          </EntityLinkList>
        </Card>
      ) : null}
    </>
  );
}

/* The faction keeps a private Treachery tracker in Play, under its setup rules; nothing when it does not. */
function TreacheryTrackerSection({ keeps }: Readonly<{ keeps?: boolean }>) {
  if (!keeps) {
    return null;
  }
  return (
    <>
      <Divider />
      <Section title="Treachery tracker">
        <Text size="sm">{TREACHERY_TRACKER_RULE}</Text>
      </Section>
    </>
  );
}

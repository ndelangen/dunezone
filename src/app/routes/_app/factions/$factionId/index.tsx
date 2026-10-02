import { Alert, Box, ColorSwatch, Divider, Flex, Group, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { troopBattleFaces } from '@shared/factions/troopBattle';
import type { TroopFaceBattleValues } from '@shared/factions/troopBattle';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageIdentity } from '@ui/block/PageIdentity';
import { Section } from '@ui/block/Section';
import { factionAssetPublishingCopy } from '@ui/content/assetPublishingStatus';
import { complexityOutOfTen, complexityTier, effectiveComplexity } from '@ui/content/complexity';
import { COMPLEXITY_TIER_PRESENTATION, ComplexityGlyph } from '@ui/content/ComplexityGlyph';
import { FormattedTextSource, InlineFormattedTextSource } from '@ui/content/FormattedText';
import { StatusBadge } from '@ui/content/StatusBadge';
import type { StatusBadgeTone } from '@ui/content/StatusBadge';
import { StatusMark } from '@ui/content/StatusMark';
import { TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Links } from '@ui/list/Links';
import type { StatsItem } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Download, Eye, FileText, Pencil, UserPlus } from 'lucide-react';
import { Fragment, useId } from 'react';
import type { ReactNode } from 'react';

import { isFactionNotFound, loadPublicFaction, useFaction } from '@db/factions';
import type { FactionData, PublicAssetPublishingStatusProjection } from '@db/factions';
import { useGroupMembershipWorkflow } from '@db/members';
import { profileAvatarUrl } from '@db/profiles';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { publicDescription, publicPageHead, useLivePageTitle } from '@app/routes/publicPage';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { useAsset } from '@game/assets/assetRenderMode';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token as FactionToken } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { TTS_COLOR_SWATCHES } from '@game/data/ttsColors';

import styles from './index.module.css';

export const Route = createFileRoute('/_app/factions/$factionId/')({
  ssr: true,
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  loader: async ({ params }) => {
    const page = await loadPublicFaction(params.factionId);
    if (!page) {
      throw notFound();
    }
    return page;
  },
  pendingComponent: FactionDetailPending,
  errorComponent: FactionDetailError,
  head: ({ match, loaderData, params }) =>
    publicPageHead({
      name: loaderData?.faction.data.name ?? 'Faction',
      pathname: `/factions/${encodeURIComponent(loaderData?.faction.slug ?? params.factionId)}`,
      description: publicDescription(loaderData?.faction.data.rules.advantages[0]?.text),
      image: loaderData ? publishedHref('faction-token', loaderData.faction._id, loaderData.faction.updated_at) : null,
      match,
    }),
  component: FactionDetailPage,
});

const backToFactions = <PageMessage.Back to="/factions">Back to factions</PageMessage.Back>;

function FactionDetailPending() {
  return (
    <PageMessage size="compact" title="Faction" back={backToFactions}>
      <LoadPending title="Loading faction">The faction details are still loading.</LoadPending>
    </PageMessage>
  );
}

function FactionSidebarOverview({ data }: { data: FactionData }) {
  return (
    <Section icon={<TopicIcon topic="factionLeader" size={20} />} title="Faction leader">
      <div className={styles.loreFactionLeaderToken}>
        <LeaderToken {...data.factionLeader} strength={undefined} background={data.background} logo={data.logo} />
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
  if (!face.values) {
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
        label={`Strength per troop: ${face.values.strength} undialed | ${face.values.supportedStrength} dialed`}
      >
        <TopicIcon topic="strength" size={15} />
        <b>
          {face.values.strength} | {face.values.supportedStrength}
        </b>
      </TroopHint>
      <TroopHint label={`Support cost: ${face.values.supportCost} spice per dialed troop`}>
        <TopicIcon topic="spice" size={15} />
        <b>{face.values.supportCost}</b>
      </TroopHint>
    </>
  );
}

function TroopFaceDetails({ face, background }: { face: TroopFace; background: FactionData['background'] }) {
  const descriptionId = useId();
  const name = `${face.face.name}${face.side === 'back' ? ', reverse side' : ''}`;
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

function FactionDetailError({ error }: ErrorComponentProps) {
  const absent = isFactionNotFound(error);
  useLivePageTitle(absent ? 'Faction not found' : undefined);
  if (absent) {
    return (
      <PageMessage size="compact" title="Faction" back={backToFactions}>
        <NotAvailable title="Faction not found">
          This faction does not exist or was deleted. Its address may have changed after a rename.
        </NotAvailable>
      </PageMessage>
    );
  }
  return (
    <PageMessage size="compact" title="Faction" back={backToFactions}>
      <LoadError title="Faction could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
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
        <Surface padding="lg">
          <Text c="dimmed">No faction advantages have been added yet.</Text>
        </Surface>
      )}
    </Section>
  );
}

function FactionDetailPage() {
  const { factionId } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const factionSeed = loaderData;

  const factionQuery = useFaction(factionId, {
    initialData: factionSeed,
  });
  const membershipWorkflow = useGroupMembershipWorkflow();
  const page = factionQuery.data;
  useLivePageTitle(page?.faction.data.name);

  if (!page) {
    return <FactionDetailPending />;
  }

  const { faction, viewerAccess, owner, assetPublishing, rulesets } = page;

  const canEdit = !factionQuery.isPending && viewerAccess.capabilities.edit;
  const canRequestMembership = !factionQuery.isPending && viewerAccess.capabilities.requestMembership;
  const assignedGroup = viewerAccess.assignedGroup;
  const membershipStatus = viewerAccess.viewer.kind === 'authenticated' ? viewerAccess.viewer.membership : 'none';

  const data = faction.data;
  const planets = data.planet ?? [];
  const troopCount = data.troops.reduce((total, troop) => total + troop.count, 0);
  const files = filesBadge(assetPublishing);
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
              <FactionToken logo={data.logo} background={data.background} />
            </div>
          }
          breadcrumb={<PageIdentity.Breadcrumb to="/factions">Factions</PageIdentity.Breadcrumb>}
          maintainers={{
            owner: owner ? { slug: owner.slug, name: owner.username, image: profileAvatarUrl(owner) } : null,
            group: assignedGroup ? { slug: assignedGroup.slug, name: assignedGroup.name } : null,
          }}
          standing={membershipBadge}
          stats={headerStats}
        />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left label="Navigation">
            <IconAction
              label="Back to factions"
              emphasis="standard"
              intent="neutral"
              size="lg"
              renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}
              icon={<ArrowLeft size={17} aria-hidden />}
            />
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
        {membershipWorkflow.request.isError ? (
          <Alert color="red" title="Membership request failed" role="alert" mb="xl">
            {membershipWorkflow.request.error?.message}
          </Alert>
        ) : null}
        <Flex direction={{ base: 'column-reverse', md: 'row' }} gap="xl" align={{ base: 'stretch', md: 'flex-start' }}>
          <Box miw={0} style={{ flex: '1 1 auto' }}>
            <Stack gap="xl">
              <Section icon={<TopicIcon topic="leaders" size={20} />} title="Leaders">
                <div className={styles.horizontalLane}>
                  {/* Position disambiguates: an author may field two identical leaders, and a
                    faction's lists carry no ids of their own. */}
                  {data.leaders.map((leader, index) => (
                    <article
                      className={styles.leaderTile}
                      key={`${leader.name}-${leader.image}-${index}`}
                      title={`${leader.name}, strength ${leader.strength ?? 'not specified'}`}
                    >
                      <LeaderToken {...leader} background={data.background} logo={data.logo} />
                    </article>
                  ))}
                </div>
              </Section>

              <FactionTroops troops={data.troops} background={data.background} />

              <FactionAdvantages advantages={data.rules.advantages} />

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <Card icon={<TopicIcon topic="alliance" size={20} />} title="Alliance">
                  <FormattedTextSource source={data.rules.alliance.text} size="sm" />
                </Card>
                <Card icon={<TopicIcon topic="fate" size={20} />} title={data.rules.fate.title || 'Fate'}>
                  <FormattedTextSource source={data.rules.fate.text} size="sm" />
                </Card>
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
                  <Stack gap="xs">
                    <Title order={3} size="h4">
                      Preferred TTS color
                    </Title>
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
                      <Text size="sm" c="dimmed">
                        None specified.
                      </Text>
                    )}
                  </Stack>
                  <Divider />
                  <Box>
                    <Title order={3} size="h4">
                      At start
                    </Title>
                    <Text size="sm" mt="xs">
                      <InlineFormattedTextSource source={data.rules.startText} />
                    </Text>
                  </Box>
                  <Divider />
                  <Box>
                    <Title order={3} size="h4">
                      Revival
                    </Title>
                    <Text size="sm" mt="xs">
                      <InlineFormattedTextSource source={data.rules.revivalText} />
                    </Text>
                  </Box>
                </Stack>
              </Surface>
            </Section>

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

            <Card icon={<TopicIcon topic="rulesets" size={20} />} title="Rulesets">
              {rulesets.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Not in a ruleset yet.
                </Text>
              ) : (
                <Links>
                  {rulesets.map((ruleset) => (
                    <Links.Item key={ruleset.id} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: ruleset.slug }}>
                      {ruleset.name}
                    </Links.Item>
                  ))}
                </Links>
              )}
            </Card>
          </Stack>
        </Flex>
      </PageLayout.Content>
    </PageLayout>
  );
}

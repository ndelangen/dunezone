import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  ColorSwatch,
  Divider,
  Flex,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { factionAssetPublishingCopy } from '@ui/content/assetPublishingStatus';
import { complexityOutOfTen, complexityTier, effectiveComplexity } from '@ui/content/complexity';
import { COMPLEXITY_TIER_PRESENTATION, ComplexityGlyph } from '@ui/content/ComplexityGlyph';
import { Eyebrow } from '@ui/content/Eyebrow';
import { ProfileLink } from '@ui/content/ProfileLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Links } from '@ui/list/Links';
import { Stats } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Download, Eye, FileText, MapPin, Pencil, UserPlus, UsersRound } from 'lucide-react';

import { loadFaction, useFaction } from '@db/factions';
import type { FactionData } from '@db/factions';
import { useGroupMembershipWorkflow } from '@db/members';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token as FactionToken } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { TTS_COLOR_SWATCHES } from '@game/data/ttsColors';

import styles from '../FactionDetail.module.css';

export const Route = createFileRoute('/_app/factions/$factionId/')({
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  loader: async ({ params }) => await loadFaction(params.factionId),
  pendingComponent: FactionDetailPending,
  errorComponent: FactionDetailError,
  component: FactionDetailPage,
});

function FactionDetailPending() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack align="center" gap="xs">
          <Title order={1}>Faction</Title>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>Back to factions</Anchor>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          <Stack gap="xs">
            <Title order={2}>Loading faction</Title>
            <Text c="dimmed">The faction details are still loading.</Text>
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** This page's compact sidebar summary for the faction's effective complexity rating. */
function FactionComplexitySummary({ score }: { score: number }) {
  return (
    <Surface padding="md">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap="xs" wrap="nowrap">
          <ComplexityGlyph score={score} size={17} decorative />
          <Text size="sm" fw={600}>
            Complexity
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          {complexityOutOfTen(score)}/10 · {COMPLEXITY_TIER_PRESENTATION[complexityTier(score)].label}
        </Text>
      </Group>
    </Surface>
  );
}

function FactionSidebarOverview({ data }: { data: FactionData }) {
  return (
    <>
      <FactionComplexitySummary score={effectiveComplexity(data.complexity)} />
      <Section icon={<TopicIcon topic="hero" size={20} />} title="Faction leader">
        <div className={styles.loreHeroToken}>
          <LeaderToken {...data.hero} strength={undefined} background={data.background} logo={data.logo} />
        </div>
      </Section>
    </>
  );
}

function FactionDetailError({ error }: ErrorComponentProps) {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack align="center" gap="xs">
          <Title order={1}>Faction</Title>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>Back to factions</Anchor>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Alert color="red" title="Faction could not be loaded" role="alert">
          <Text size="sm">{error.message || 'An unexpected error occurred.'}</Text>
        </Alert>
      </PageLayout.Content>
    </PageLayout>
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

  if (!page) {
    return (
      <PageLayout>
        <PageLayout.Header>
          <Stack align="center" gap="xs">
            <Title order={1}>Faction</Title>
            <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>Back to factions</Anchor>
          </Stack>
        </PageLayout.Header>
        <PageLayout.Content>
          <Surface padding="xl">
            <Stack gap="xs">
              <Title order={2}>Loading faction</Title>
              <Text c="dimmed">The faction details are still loading.</Text>
            </Stack>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  const { faction, viewerAccess, owner, assetPublishing, rulesets } = page;

  const { edit: canEdit, requestMembership: canRequestMembership } = viewerAccess.capabilities;
  const assignedGroup = viewerAccess.assignedGroup;
  const membershipStatus = viewerAccess.viewer.kind === 'authenticated' ? viewerAccess.viewer.membership : 'none';

  const data = faction.data;
  const planets = data.planet ?? [];
  const troopCount = data.troops.reduce((total, troop) => total + troop.count, 0);
  const publishingStatus = assetPublishing.captureStatus ?? assetPublishing.status;
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Group wrap="nowrap" align="center" gap="lg" className={styles.pageHead}>
          <div className={styles.factionSymbol} role="img" aria-label={`${data.name} symbol`}>
            <FactionToken logo={data.logo} background={data.background} />
          </div>
          <Stack gap={6} className={styles.pageHeadText}>
            <Group gap="xs" wrap="wrap">
              <Anchor size="sm" fw={600} renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>
                Factions
              </Anchor>
            </Group>
            <Title order={1} className={styles.factionTitle}>
              {data.name}
            </Title>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" c="dimmed">
                Maintained by
              </Text>
              {owner ? <ProfileLink {...owner} /> : <Text size="sm">Unknown</Text>}
            </Group>
          </Stack>
        </Group>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs" wrap="wrap" role="group" aria-label="Navigation and editing">
              <IconAction
                label="Back to factions"
                variant="light"
                color="gray"
                size="lg"
                renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}
                icon={<ArrowLeft size={17} aria-hidden />}
              />
              {canEdit ? (
                <IconAction
                  label="Edit faction"
                  variant="light"
                  color="dune"
                  size="lg"
                  renderRoot={(rootProps) => (
                    <Link {...rootProps} to="/factions/$factionId/edit" params={{ factionId }} />
                  )}
                  icon={<Pencil size={17} aria-hidden />}
                />
              ) : null}
            </Group>
          </Toolbar.Left>

          <Toolbar.Right>
            <Group gap="xs" wrap="wrap" role="group" aria-label="Faction actions">
              <IconAction
                label="Preview faction sheet"
                variant="filled"
                color="confirm"
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
                  variant="light"
                  color="dune"
                  size="lg"
                  href={assetPublishing.publicationHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<Download size={17} aria-hidden />}
                />
              ) : null}
            </Group>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
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

              <Section icon={<TopicIcon topic="troops" size={20} />} title="Troops">
                <div className={styles.horizontalLane}>
                  {data.troops.map((troop, index) => (
                    <Surface
                      as="article"
                      padding="sm"
                      className={styles.troopTile}
                      key={`${troop.name}-${troop.image}-${index}`}
                    >
                      <Group wrap="nowrap" gap="md">
                        <div className={styles.troopToken}>
                          <TroopToken
                            background={data.background}
                            image={troop.image}
                            hue={troop.hue}
                            star={troop.star}
                            striped={troop.striped}
                          />
                        </div>
                        <Stack gap={4} miw={0} style={{ flex: '1 1 auto' }}>
                          <Group gap="xs" wrap="nowrap" justify="space-between">
                            <Text fw={700} lh={1.2}>
                              {troop.name}
                            </Text>
                            <Badge variant="default" size="lg">
                              ×{troop.count}
                            </Badge>
                          </Group>
                          {troop.description ? (
                            <Text size="xs" c="dimmed">
                              {troop.description}
                            </Text>
                          ) : null}
                        </Stack>
                      </Group>
                    </Surface>
                  ))}
                </div>
              </Section>

              {planets.length > 0 ? (
                <Section icon={<MapPin size={20} aria-hidden />} title="Planets">
                  <div className={styles.horizontalLane}>
                    {planets.map((planet, index) => (
                      <Surface
                        as="article"
                        padding="md"
                        className={styles.planetTile}
                        key={`${planet.name}-${planet.image}-${index}`}
                      >
                        <Stack gap="xs">
                          <Text fw={700}>{planet.name}</Text>
                          <Text size="xs" c="dimmed">
                            {planet.description}
                          </Text>
                        </Stack>
                      </Surface>
                    ))}
                  </div>
                </Section>
              ) : null}

              <Section icon={<TopicIcon topic="advantages" size={20} />} title="Advantages">
                {data.rules.advantages.length > 0 ? (
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    {data.rules.advantages.map((advantage, index) => (
                      <Card
                        key={`${advantage.title ?? 'advantage'}-${advantage.text}-${index}`}
                        title={advantage.title ?? `Advantage ${index + 1}`}
                      >
                        <Stack gap="sm">
                          <Text size="sm">{advantage.text}</Text>
                          {advantage.karama ? (
                            <Group gap="xs" wrap="nowrap" align="flex-start">
                              <TopicIcon topic="karama" size={16} />
                              <Text size="sm" c="dimmed">
                                {advantage.karama}
                              </Text>
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

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <Card icon={<TopicIcon topic="alliance" size={20} />} title="Alliance">
                  <Text size="sm">{data.rules.alliance.text}</Text>
                </Card>
                <Card icon={<TopicIcon topic="fate" size={20} />} title={data.rules.fate.title || 'Fate'}>
                  <Text size="sm">{data.rules.fate.text}</Text>
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

            <Section icon={<TopicIcon topic="setup" size={20} />} title="Setup">
              <Surface padding="lg">
                <Stack gap="lg">
                  <Box>
                    <Title order={3} size="h4">
                      Components
                    </Title>
                    <Box mt="sm">
                      <Stats
                        items={[
                          {
                            key: 'spice',
                            icon: <TopicIcon topic="spice" size={17} />,
                            value: data.rules.spiceCount,
                            label: `${data.rules.spiceCount} spice`,
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
                        ]}
                      />
                    </Box>
                    <Stack gap="xs" mt="lg">
                      <Title order={4} size="h5">
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
                  </Box>
                  <Divider />
                  <Box>
                    <Title order={3} size="h4">
                      At start
                    </Title>
                    <Text size="sm" mt="xs">
                      {data.rules.startText}
                    </Text>
                  </Box>
                  <Divider />
                  <Box>
                    <Title order={3} size="h4">
                      Revival
                    </Title>
                    <Text size="sm" mt="xs">
                      {data.rules.revivalText}
                    </Text>
                  </Box>
                </Stack>
              </Surface>
            </Section>

            <Card icon={<UsersRound size={20} aria-hidden />} title="Stewardship">
              {!assignedGroup ? (
                <Text size="sm" c="dimmed">
                  No maintaining group.
                </Text>
              ) : (
                <Stack gap="sm">
                  <Box>
                    <Eyebrow>Maintaining group</Eyebrow>
                    {assignedGroup.slug ? (
                      <Anchor
                        fw={600}
                        renderRoot={(rootProps) => (
                          <Link {...rootProps} to="/groups/$groupSlug" params={{ groupSlug: assignedGroup.slug }} />
                        )}
                      >
                        {assignedGroup.name}
                      </Anchor>
                    ) : (
                      <Text fw={600}>{assignedGroup.name}</Text>
                    )}
                  </Box>
                  <Group justify="space-between" gap="xs">
                    <Text size="sm" c="dimmed">
                      Your membership
                    </Text>
                    <StatusBadge
                      tone={
                        membershipStatus === 'active'
                          ? 'positive'
                          : membershipStatus === 'pending'
                            ? 'pending'
                            : 'neutral'
                      }
                    >
                      {membershipStatus === 'active'
                        ? 'Active'
                        : membershipStatus === 'pending'
                          ? 'Pending'
                          : 'Not a member'}
                    </StatusBadge>
                  </Group>
                  {viewerAccess?.viewer.kind === 'anonymous' ? (
                    <Text size="sm">
                      <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to
                      join.
                    </Text>
                  ) : null}
                  {canRequestMembership ? (
                    <Button
                      type="button"
                      variant="light"
                      leftSection={<UserPlus size={16} aria-hidden />}
                      loading={membershipWorkflow.request.isPending}
                      onClick={() => void membershipWorkflow.request.run(assignedGroup.id).catch(() => undefined)}
                    >
                      Request membership
                    </Button>
                  ) : null}
                </Stack>
              )}
              {membershipWorkflow.request.isError ? (
                <Alert color="red" title="Membership request failed" role="alert">
                  {membershipWorkflow.request.error?.message}
                </Alert>
              ) : null}
            </Card>

            <Card
              icon={<FileText size={20} aria-hidden />}
              title="Files"
              action={
                <StatusBadge
                  live
                  tone={
                    publishingStatus === 'current'
                      ? 'positive'
                      : publishingStatus === 'scheduled'
                        ? 'pending'
                        : publishingStatus === 'in_progress'
                          ? 'progress'
                          : 'neutral'
                  }
                >
                  {publishingStatus === 'in_progress'
                    ? 'In progress'
                    : publishingStatus === 'scheduled'
                      ? 'Scheduled'
                      : publishingStatus === 'current'
                        ? 'Current'
                        : 'Unavailable'}
                </StatusBadge>
              }
            >
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  {factionAssetPublishingCopy(assetPublishing.status, 'idle', assetPublishing.captureStatus)}
                </Text>
                <Anchor
                  fw={600}
                  renderRoot={(rootProps) => (
                    <Link
                      {...rootProps}
                      to="/preview/sheet/$factionSlug"
                      params={{ factionSlug: factionId }}
                      search={{ mode: 'db' }}
                    />
                  )}
                >
                  Preview faction sheet
                </Anchor>
              </Stack>
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

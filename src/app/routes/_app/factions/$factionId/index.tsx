import {
  ActionIcon,
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
import { Eyebrow } from '@ui/content/Eyebrow';
import { Section } from '@ui/content/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { Region } from '@ui/layout/Region';
import { SectionIntro } from '@ui/layout/SectionIntro';
import { Links } from '@ui/list/Links';
import { Stats } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  MapPin,
  Pencil,
  UserPlus,
  UsersRound,
} from 'lucide-react';

import { loadFaction, useFaction } from '@db/factions';
import { useGroupMembershipWorkflow } from '@db/members';
import { viewerActionsFor } from '@app/access/viewerActions';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { PageLayout } from '@app/components/shell';
import { TopicIcon } from '@app/components/topics/TopicIcon';
import { factionAssetPublishingCopy } from '@app/factions/assetPublishingStatus';
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
    <PageLayout
      header={
        <Stack align="center" gap="xs">
          <Title order={1}>Faction</Title>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>
            Back to factions
          </Anchor>
        </Stack>
      }
    >
      <Surface padding="xl">
        <Stack gap="xs">
          <Title order={2}>Loading faction</Title>
          <Text c="dimmed">The faction details are still loading.</Text>
        </Stack>
      </Surface>
    </PageLayout>
  );
}

function FactionDetailError({ error }: ErrorComponentProps) {
  return (
    <PageLayout
      header={
        <Stack align="center" gap="xs">
          <Title order={1}>Faction</Title>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>
            Back to factions
          </Anchor>
        </Stack>
      }
    >
      <Alert color="red" title="Faction could not be loaded" role="alert">
        <Text size="sm">{error.message || 'An unexpected error occurred.'}</Text>
      </Alert>
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
      <PageLayout
        header={
          <Stack align="center" gap="xs">
            <Title order={1}>Faction</Title>
            <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>
              Back to factions
            </Anchor>
          </Stack>
        }
      >
        <Surface padding="xl">
          <Stack gap="xs">
            <Title order={2}>Loading faction</Title>
            <Text c="dimmed">The faction details are still loading.</Text>
          </Stack>
        </Surface>
      </PageLayout>
    );
  }

  const { faction, viewerAccess, owner, assetPublishing, rulesets } = page;

  const { canEdit, assignedGroup, membershipStatus, canRequestMembership } = viewerActionsFor(
    viewerAccess,
    { subjectGroupId: faction.group_id }
  );

  const data = faction.data;
  const planets = data.planet ?? [];
  const troopCount = data.troops.reduce((total, troop) => total + troop.count, 0);
  const publishingStatus = assetPublishing.captureStatus ?? assetPublishing.status;

  return (
    <PageLayout
      headerSize="compact"
      header={
        <Group wrap="nowrap" align="center" gap="lg" className={styles.pageHead}>
          <div className={styles.factionSymbol} role="img" aria-label={`${data.name} symbol`}>
            <FactionToken logo={data.logo} background={data.background} />
          </div>
          <Stack gap={6} className={styles.pageHeadText}>
            <Group gap="xs" wrap="wrap">
              <Anchor
                size="sm"
                fw={600}
                renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}
              >
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
      }
      toolbar={
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs" wrap="wrap" role="group" aria-label="Navigation and editing">
              <Tooltip label="Back to factions">
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="lg"
                  aria-label="Back to factions"
                  renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}
                >
                  <ArrowLeft size={17} aria-hidden />
                </ActionIcon>
              </Tooltip>
              {canEdit ? (
                <Tooltip label="Edit faction">
                  <ActionIcon
                    variant="light"
                    color="dune"
                    size="lg"
                    aria-label="Edit faction"
                    renderRoot={(rootProps) => (
                      <Link {...rootProps} to="/factions/$factionId/edit" params={{ factionId }} />
                    )}
                  >
                    <Pencil size={17} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              ) : null}
            </Group>
          </Toolbar.Left>

          <Toolbar.Right>
            <Group gap="xs" wrap="wrap" role="group" aria-label="Faction actions">
              <Tooltip label="Preview faction sheet">
                <ActionIcon
                  variant="filled"
                  color="confirm"
                  size="lg"
                  aria-label="Preview faction sheet"
                  renderRoot={(rootProps) => (
                    <Link
                      {...rootProps}
                      to="/preview/sheet/$factionSlug"
                      params={{ factionSlug: factionId }}
                      search={{ mode: 'db' }}
                      target="_blank"
                    />
                  )}
                >
                  <Eye size={17} aria-hidden />
                </ActionIcon>
              </Tooltip>
              {assetPublishing.publicationHref ? (
                <Tooltip label="Open published PDF">
                  <ActionIcon
                    component="a"
                    variant="light"
                    color="dune"
                    size="lg"
                    aria-label="Open published PDF"
                    href={assetPublishing.publicationHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={17} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              ) : null}
            </Group>
          </Toolbar.Right>
        </Toolbar>
      }
    >
      <Flex
        direction={{ base: 'column-reverse', md: 'row' }}
        gap="xl"
        align={{ base: 'stretch', md: 'flex-start' }}
      >
        <Box miw={0} style={{ flex: '1 1 auto' }}>
          <Stack gap="xl">
            <Region
              heading={<Section icon={<TopicIcon topic="leaders" size={20} />} title="Leaders" />}
            >
              <div className={styles.horizontalLane}>
                {data.leaders.map((leader) => (
                  <article
                    className={styles.leaderTile}
                    key={`${leader.name}-${leader.image}`}
                    title={`${leader.name}, strength ${leader.strength ?? 'not specified'}`}
                  >
                    <LeaderToken {...leader} background={data.background} logo={data.logo} />
                  </article>
                ))}
              </div>
            </Region>

            <Region
              heading={<Section icon={<TopicIcon topic="troops" size={20} />} title="Troops" />}
            >
              <div className={styles.horizontalLane}>
                {data.troops.map((troop) => (
                  <Surface
                    as="article"
                    padding="sm"
                    className={styles.troopTile}
                    key={`${troop.name}-${troop.image}`}
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
                          <Badge variant="filled" color="grey" size="lg">
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
            </Region>

            {planets.length > 0 ? (
              <Region heading={<Section icon={<MapPin size={20} aria-hidden />} title="Planets" />}>
                <div className={styles.horizontalLane}>
                  {planets.map((planet) => (
                    <Surface
                      as="article"
                      padding="md"
                      className={styles.planetTile}
                      key={`${planet.name}-${planet.image}`}
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
              </Region>
            ) : null}

            <Region
              heading={
                <Section icon={<TopicIcon topic="advantages" size={20} />} title="Advantages" />
              }
            >
              {data.rules.advantages.length > 0 ? (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  {data.rules.advantages.map((advantage, index) => (
                    <Card
                      key={`${advantage.title ?? 'advantage'}-${advantage.text}`}
                      header={
                        <Section
                          level="subsection"
                          title={advantage.title ?? `Advantage ${index + 1}`}
                        />
                      }
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
            </Region>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Card
                header={
                  <Section
                    icon={<TopicIcon topic="alliance" size={20} />}
                    level="subsection"
                    title="Alliance"
                  />
                }
              >
                <Text size="sm">{data.rules.alliance.text}</Text>
              </Card>
              <Card
                header={
                  <Section
                    icon={<TopicIcon topic="fate" size={20} />}
                    level="subsection"
                    title={data.rules.fate.title || 'Fate'}
                  />
                }
              >
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
          <Region
            heading={<Section icon={<TopicIcon topic="hero" size={20} />} title="Faction leader" />}
          >
            <div className={styles.loreHeroToken}>
              <LeaderToken
                {...data.hero}
                strength={undefined}
                background={data.background}
                logo={data.logo}
              />
            </div>
          </Region>

          <Region heading={<Section icon={<TopicIcon topic="setup" size={20} />} title="Setup" />}>
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
          </Region>

          <Card
            header={<Section icon={<UsersRound size={20} aria-hidden />} title="Stewardship" />}
          >
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
                        <Link
                          {...rootProps}
                          to="/groups/$groupSlug"
                          params={{ groupSlug: assignedGroup.slug }}
                        />
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
                    <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>
                      Log in
                    </Anchor>{' '}
                    to join.
                  </Text>
                ) : null}
                {canRequestMembership ? (
                  <Button
                    type="button"
                    variant="light"
                    leftSection={<UserPlus size={16} aria-hidden />}
                    loading={membershipWorkflow.request.isPending}
                    onClick={() =>
                      void membershipWorkflow.request.run(assignedGroup.id).catch(() => undefined)
                    }
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
            header={
              <SectionIntro
                heading={<Section icon={<FileText size={20} aria-hidden />} title="Files" />}
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
              />
            }
          >
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                {factionAssetPublishingCopy(
                  assetPublishing.status,
                  'idle',
                  assetPublishing.captureStatus
                )}
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

          <Card
            header={<Section icon={<TopicIcon topic="rulesets" size={20} />} title="Rulesets" />}
          >
            {rulesets.length === 0 ? (
              <Text size="sm" c="dimmed">
                Not in a ruleset yet.
              </Text>
            ) : (
              <Links>
                {rulesets.map((ruleset) => (
                  <Links.Item
                    key={ruleset.id}
                    to="/rulesets/$rulesetSlug"
                    params={{ rulesetSlug: ruleset.slug }}
                  >
                    {ruleset.name}
                  </Links.Item>
                ))}
              </Links>
            )}
          </Card>
        </Stack>
      </Flex>
    </PageLayout>
  );
}

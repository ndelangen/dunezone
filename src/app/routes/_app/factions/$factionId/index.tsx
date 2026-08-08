import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  ColorSwatch,
  Divider,
  Flex,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
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
import type { ComponentProps, ReactNode } from 'react';

import { loadFaction, useFaction } from '@db/factions';
import { useGroupMembershipWorkflow } from '@db/members';
import { viewerActionsFor } from '@app/access/viewerActions';
import { IconStat } from '@app/components/content/IconStat';
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
      <Paper withBorder p="xl" radius="md" aria-live="polite">
        <Stack gap="xs">
          <Title order={2}>Loading faction</Title>
          <Text c="dimmed">The faction details are still loading.</Text>
        </Stack>
      </Paper>
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
        <Paper withBorder p="xl" radius="md">
          <Stack gap="xs">
            <Title order={2}>Loading faction</Title>
            <Text c="dimmed">The faction details are still loading.</Text>
          </Stack>
        </Paper>
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
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between" gap="sm" wrap="wrap">
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
          </Group>
        </Paper>
      }
    >
      <Flex
        direction={{ base: 'column-reverse', md: 'row' }}
        gap="xl"
        align={{ base: 'stretch', md: 'flex-start' }}
      >
        <Box miw={0} style={{ flex: '1 1 auto' }}>
          <Stack gap="xl">
            <Stack component="section" aria-labelledby="leaders-heading" gap="md">
              <SectionHeading id="leaders-heading" icon={<TopicIcon topic="leaders" size={20} />}>
                Leaders
              </SectionHeading>
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
            </Stack>

            <Stack component="section" aria-labelledby="troops-heading" gap="md">
              <SectionHeading id="troops-heading" icon={<TopicIcon topic="troops" size={20} />}>
                Troops
              </SectionHeading>
              <div className={styles.horizontalLane}>
                {data.troops.map((troop) => (
                  <Paper
                    component="article"
                    withBorder
                    p="sm"
                    radius="md"
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
                  </Paper>
                ))}
              </div>
            </Stack>

            {planets.length > 0 ? (
              <Stack component="section" aria-labelledby="planets-heading" gap="md">
                <SectionHeading id="planets-heading" icon={<MapPin size={20} aria-hidden />}>
                  Planets
                </SectionHeading>
                <div className={styles.horizontalLane}>
                  {planets.map((planet) => (
                    <Paper
                      component="article"
                      withBorder
                      p="md"
                      radius="md"
                      className={styles.planetTile}
                      key={`${planet.name}-${planet.image}`}
                    >
                      <Stack gap="xs">
                        <Text fw={700}>{planet.name}</Text>
                        <Text size="xs" c="dimmed">
                          {planet.description}
                        </Text>
                      </Stack>
                    </Paper>
                  ))}
                </div>
              </Stack>
            ) : null}

            <Stack component="section" aria-labelledby="advantages-heading" gap="md">
              <SectionHeading
                id="advantages-heading"
                icon={<TopicIcon topic="advantages" size={20} />}
              >
                Advantages
              </SectionHeading>
              {data.rules.advantages.length > 0 ? (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  {data.rules.advantages.map((advantage, index) => (
                    <Card
                      key={`${advantage.title ?? 'advantage'}-${advantage.text}`}
                      withBorder
                      padding="lg"
                      radius="md"
                    >
                      <Stack gap="sm">
                        <Title order={3} size="h4">
                          {advantage.title ?? `Advantage ${index + 1}`}
                        </Title>
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
                <Paper withBorder p="lg" radius="md">
                  <Text c="dimmed">No faction advantages have been added yet.</Text>
                </Paper>
              )}
            </Stack>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Card withBorder padding="lg" radius="md">
                <Stack gap="md">
                  <SectionHeading icon={<TopicIcon topic="alliance" size={20} />} order={3}>
                    Alliance
                  </SectionHeading>
                  <Text size="sm">{data.rules.alliance.text}</Text>
                </Stack>
              </Card>
              <Card withBorder padding="lg" radius="md">
                <Stack gap="md">
                  <SectionHeading icon={<TopicIcon topic="fate" size={20} />} order={3}>
                    {data.rules.fate.title ?? 'Fate'}
                  </SectionHeading>
                  <Text size="sm">{data.rules.fate.text}</Text>
                </Stack>
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
          <Stack component="section" aria-labelledby="faction-leader-heading" gap="md">
            <SectionHeading id="faction-leader-heading" icon={<TopicIcon topic="hero" size={20} />}>
              Faction leader
            </SectionHeading>
            <div className={styles.loreHeroToken}>
              <LeaderToken
                {...data.hero}
                strength={undefined}
                background={data.background}
                logo={data.logo}
              />
            </div>
          </Stack>

          <Stack component="section" aria-labelledby="setup-heading" gap="md">
            <SectionHeading id="setup-heading" icon={<TopicIcon topic="setup" size={20} />}>
              Setup
            </SectionHeading>
            <Card withBorder padding="lg" radius="md">
              <Stack gap="lg">
                <Box>
                  <Title order={3} size="h4">
                    Components
                  </Title>
                  <Group gap="lg" mt="sm" wrap="wrap">
                    <IconStat
                      icon={<TopicIcon topic="spice" size={17} />}
                      value={data.rules.spiceCount}
                      label={`${data.rules.spiceCount} spice`}
                    />
                    <IconStat
                      icon={<TopicIcon topic="leaders" size={17} />}
                      value={data.leaders.length}
                      label={`${data.leaders.length} ${data.leaders.length === 1 ? 'leader' : 'leaders'}`}
                    />
                    <IconStat
                      icon={<TopicIcon topic="troops" size={17} />}
                      value={troopCount}
                      label={`${troopCount} ${troopCount === 1 ? 'troop' : 'troops'}`}
                    />
                  </Group>
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
            </Card>
          </Stack>

          <Card withBorder padding="lg" radius="md">
            <Stack gap="md">
              <SectionHeading icon={<UsersRound size={20} aria-hidden />}>
                Stewardship
              </SectionHeading>
              {faction.group_id == null ? (
                <Text size="sm" c="dimmed">
                  No maintaining group.
                </Text>
              ) : !assignedGroup ? (
                <Text size="sm" c="dimmed">
                  Group unavailable.
                </Text>
              ) : (
                <Stack gap="sm">
                  <Box>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                      Maintaining group
                    </Text>
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
                    <Badge
                      color={
                        membershipStatus === 'active'
                          ? 'green'
                          : membershipStatus === 'pending'
                            ? 'yellow'
                            : 'gray'
                      }
                      variant="light"
                    >
                      {membershipStatus === 'active'
                        ? 'Active'
                        : membershipStatus === 'pending'
                          ? 'Pending'
                          : 'Not a member'}
                    </Badge>
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
            </Stack>
          </Card>

          <Card withBorder padding="lg" radius="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" gap="sm">
                <SectionHeading icon={<FileText size={20} aria-hidden />}>Files</SectionHeading>
                <Badge
                  variant="light"
                  color={
                    publishingStatus === 'current'
                      ? 'green'
                      : publishingStatus === 'scheduled'
                        ? 'yellow'
                        : publishingStatus === 'in_progress'
                          ? 'blue'
                          : 'gray'
                  }
                  role="status"
                  aria-live="polite"
                >
                  {publishingStatus === 'in_progress'
                    ? 'In progress'
                    : publishingStatus === 'scheduled'
                      ? 'Scheduled'
                      : publishingStatus === 'current'
                        ? 'Current'
                        : 'Unavailable'}
                </Badge>
              </Group>
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

          <Card withBorder padding="lg" radius="md">
            <Stack gap="sm">
              <SectionHeading icon={<TopicIcon topic="rulesets" size={20} />}>
                Rulesets
              </SectionHeading>
              {rulesets.length > 0 ? (
                <Stack component="ul" gap="xs" m={0} pl="lg">
                  {rulesets.map((ruleset) => (
                    <li key={ruleset.id}>
                      <Anchor
                        renderRoot={(rootProps) => (
                          <Link
                            {...rootProps}
                            to="/rulesets/$rulesetSlug"
                            params={{ rulesetSlug: ruleset.slug }}
                          />
                        )}
                      >
                        {ruleset.name}
                      </Anchor>
                    </li>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Not in a ruleset yet.
                </Text>
              )}
            </Stack>
          </Card>
        </Stack>
      </Flex>
    </PageLayout>
  );
}

function SectionHeading({
  icon,
  children,
  order = 2,
  ...props
}: {
  icon: ReactNode;
  children: ReactNode;
  order?: 2 | 3;
} & ComponentProps<typeof Group>) {
  return (
    <Group gap="xs" wrap="nowrap" c="var(--color-text, var(--mantine-color-text))" {...props}>
      <Title order={order} size={order === 2 ? 'h3' : 'h4'}>
        {children}
      </Title>
      {icon}
    </Group>
  );
}

import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Image,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  useNavigate,
} from '@tanstack/react-router';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  FileText,
  Layers3,
  ListTree,
  MessageCircleQuestionMark,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  UserRoundMinus,
  UsersRound,
} from 'lucide-react';

import { useRequestGroupMembership } from '@db/members';
import { useCurrentProfile } from '@db/profiles';
import {
  loadRulesetDetailPage,
  useDeleteRuleset,
  useRulesetDetailPage,
  useUpdateRuleset,
} from '@db/rulesets';
import { IconStat } from '@app/components/content/IconStat';
import { FaqList } from '@app/components/faq/FaqList';
import { GroupAssignPopover } from '@app/components/groups/GroupAssignPopover';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { PageLayout } from '@app/components/shell';
import { TopicIcon } from '@app/components/topics/TopicIcon';
import { FAQ_TAG_LABELS, FAQ_TAG_VALUES, type FaqTag } from '@app/faq/tags';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

import styles from '../RulesetDetail.module.css';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/')({
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  validateSearch: (params: Record<string, unknown>): { q?: string; tag?: FaqTag } => {
    const q = params?.q;
    const tag = params?.tag;
    return {
      ...(typeof q === 'string' ? { q } : {}),
      ...(typeof tag === 'string' && FAQ_TAG_VALUES.includes(tag as FaqTag)
        ? { tag: tag as FaqTag }
        : {}),
    };
  },
  loader: async ({ params }) => {
    const detailPage = await loadRulesetDetailPage(params.rulesetSlug);
    if (!detailPage) {
      return { notFound: true as const };
    }
    return { notFound: false as const, detailPage };
  },
  pendingComponent: RulesetDetailPending,
  errorComponent: RulesetDetailError,
  component: RulesetDetailPage,
});

function RulesetDetailPending() {
  return (
    <PageLayout
      header={
        <Stack align="center" gap="xs">
          <Title order={1}>Ruleset</Title>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}>
            Back to rulesets
          </Anchor>
        </Stack>
      }
    >
      <Paper withBorder p="xl" radius="md" aria-live="polite">
        <Stack gap="xs">
          <Title order={2}>Loading ruleset</Title>
          <Text c="dimmed">The ruleset details are still loading.</Text>
        </Stack>
      </Paper>
    </PageLayout>
  );
}

function RulesetDetailError({ error }: ErrorComponentProps) {
  return (
    <PageLayout
      header={
        <Stack align="center" gap="xs">
          <Title order={1}>Ruleset</Title>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}>
            Back to rulesets
          </Anchor>
        </Stack>
      }
    >
      <Alert color="red" title="Ruleset could not be loaded" role="alert">
        <Text size="sm">{error.message || 'An unexpected error occurred.'}</Text>
      </Alert>
    </PageLayout>
  );
}

function RulesetDetailPage() {
  const { rulesetSlug } = Route.useParams();
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const detailSeed = loaderData.notFound ? undefined : loaderData.detailPage;
  const page = useRulesetDetailPage(rulesetSlug, { initialData: detailSeed });
  const profile = useCurrentProfile();
  const deleteRuleset = useDeleteRuleset();
  const updateRuleset = useUpdateRuleset();
  const requestMembership = useRequestGroupMembership();

  if (loaderData.notFound || !page.ruleset) {
    return (
      <PageLayout
        header={
          <Stack align="center" gap="xs">
            <Title order={1}>Ruleset</Title>
            <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}>
              Back to rulesets
            </Anchor>
          </Stack>
        }
      >
        <Paper withBorder p="xl" radius="md">
          <Stack gap="xs">
            <Title order={2}>Ruleset not found</Title>
            <Text c="dimmed">This ruleset does not exist or was deleted.</Text>
          </Stack>
        </Paper>
      </PageLayout>
    );
  }

  const r = page.ruleset;
  const isOwner = profile.data?.user_id === r.owner_id;
  const profileUserId = profile.data?.user_id;
  const assignedGroup = page.groupAccess?.group;
  const groupMembersList = page.groupAccess?.members ?? [];
  const viewerMembership = groupMembersList.find(
    (entry) => entry.membership.user_id === profileUserId
  )?.membership;
  const membershipStatus =
    viewerMembership && viewerMembership.status !== 'removed' ? viewerMembership.status : 'none';
  const canRequestMembership = !!profileUserId && !!assignedGroup && membershipStatus === 'none';
  const answeredFaqCount = page.faqItems.filter((item) => item.accepted_answer_id != null).length;
  const mutationError =
    deleteRuleset.error?.message ??
    requestMembership.error?.message ??
    updateRuleset.error?.message;

  const handleDelete = () => {
    if (!window.confirm(`Delete ruleset "${r.name}"? This cannot be undone.`)) return;
    deleteRuleset.mutate(r._id, {
      onSuccess: () => navigate({ to: '/rulesets' }),
    });
  };

  const handleFaqSearchChange = (value: string) => {
    navigate({
      to: '.',
      search: (prev) => ({ ...prev, q: value.trim() || undefined }),
      replace: true,
    });
  };

  const handleFaqTagChange = (value: string | null) => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        tag: value == null || value === '__all__' ? undefined : (value as FaqTag),
      }),
      replace: true,
    });
  };

  return (
    <PageLayout
      headerSize="compact"
      header={
        <Group wrap="nowrap" align="center" gap="lg" className={styles.pageHead}>
          <Paper className={styles.rulesetHeadCover} radius="md" withBorder>
            {r.image_cover ? (
              <Image
                src={r.image_cover}
                fallbackSrc="/image/background/card.jpg"
                alt={`Cover for ${r.name}`}
                className={styles.coverImage}
              />
            ) : null}
            <span className={styles.rulesetHeadGlyph}>
              <TopicIcon topic="rulesets" size={28} />
            </span>
          </Paper>
          <Stack gap={6} className={styles.pageHeadText}>
            <Anchor
              size="sm"
              fw={600}
              renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
            >
              Rulesets
            </Anchor>
            <Title order={1} className={styles.rulesetTitle}>
              {r.name}
            </Title>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" c="dimmed">
                Maintained by
              </Text>
              {page.owner ? (
                <ProfileLink
                  slug={page.owner.slug}
                  username={page.owner.username}
                  avatar_url={page.owner.avatar_url}
                />
              ) : (
                <Text size="sm">Unknown</Text>
              )}
            </Group>
          </Stack>
        </Group>
      }
      toolbar={
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between" gap="sm" wrap="wrap">
            <Group gap="xs" wrap="wrap" role="group" aria-label="Navigation and editing">
              <Tooltip label="Back to rulesets">
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="lg"
                  aria-label="Back to rulesets"
                  renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
                >
                  <ArrowLeft size={17} aria-hidden />
                </ActionIcon>
              </Tooltip>
              {isOwner ? (
                <Tooltip label="Edit ruleset">
                  <ActionIcon
                    variant="light"
                    color="dune"
                    size="lg"
                    aria-label="Edit ruleset"
                    renderRoot={(rootProps) => (
                      <Link
                        {...rootProps}
                        to="/rulesets/$rulesetSlug/edit"
                        params={{ rulesetSlug: r.slug }}
                      />
                    )}
                  >
                    <Pencil size={17} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              ) : null}
            </Group>

            {profile.data?._id ? (
              <Group gap="xs" wrap="wrap" role="group" aria-label="Ruleset actions">
                <Tooltip label="Ask a question">
                  <ActionIcon
                    type="button"
                    variant="filled"
                    color="confirm"
                    size="lg"
                    aria-label="Ask a question"
                    onClick={() =>
                      navigate({
                        to: '/rulesets/$rulesetSlug/faq/create',
                        params: { rulesetSlug: r.slug },
                      })
                    }
                  >
                    <MessageCircleQuestionMark size={17} aria-hidden />
                  </ActionIcon>
                </Tooltip>
                {isOwner ? (
                  <>
                    {r.group_id == null ? (
                      <GroupAssignPopover
                        disabled={!isOwner || updateRuleset.isPending}
                        userId={profileUserId}
                        isUserPending={profile.isPending}
                        prefetchedMemberships={page.viewerAssignableMemberships}
                        onChangeGroup={async (nextGroupId) => {
                          await updateRuleset.mutateAsync({
                            id: r._id,
                            input: { name: r.name },
                            groupId: nextGroupId,
                            imageCover: r.image_cover ?? null,
                          });
                        }}
                        title="Assign Group"
                        descriptionLines={[
                          `Assign a group that can help maintain "${r.name}".`,
                          'You can create and join groups from your profile.',
                        ]}
                      />
                    ) : (
                      <Tooltip label="Remove group">
                        <ActionIcon
                          type="button"
                          aria-label="Remove group"
                          color="red"
                          variant="light"
                          size="lg"
                          disabled={updateRuleset.isPending}
                          onClick={() =>
                            void updateRuleset.mutateAsync({
                              id: r._id,
                              input: { name: r.name },
                              groupId: null,
                              imageCover: r.image_cover ?? null,
                            })
                          }
                        >
                          <UserRoundMinus size={17} aria-hidden />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Delete ruleset">
                      <ActionIcon
                        color="red"
                        variant="light"
                        type="button"
                        size="lg"
                        aria-label="Delete ruleset"
                        onClick={handleDelete}
                        disabled={deleteRuleset.isPending}
                      >
                        <Trash2 size={17} aria-hidden />
                      </ActionIcon>
                    </Tooltip>
                  </>
                ) : null}
              </Group>
            ) : null}
          </Group>
        </Paper>
      }
    >
      <Box className={styles.detailGrid}>
        <Stack gap="xl" className={styles.primaryColumn}>
          {mutationError ? (
            <Alert color="red" title="The change could not be saved" role="alert">
              {mutationError}
            </Alert>
          ) : null}

          <Stack component="section" id="overview" aria-labelledby="overview-heading" gap="md">
            <SectionHeading id="overview-heading" icon={<BookOpen size={20} aria-hidden />}>
              About this ruleset
            </SectionHeading>
            <Paper withBorder p="lg" radius="md">
              <Stack gap="sm">
                <Badge variant="light" color="gray" w="fit-content">
                  Planned content · new fields required
                </Badge>
                <Text>
                  A concise introduction explaining the ruleset&apos;s purpose, intended audience,
                  and how it differs from the base game.
                </Text>
                <Text c="dimmed">
                  Compatibility should identify the base edition or parent ruleset, required
                  expansions, and whether this ruleset can be mixed with other variants.
                </Text>
              </Stack>
            </Paper>
          </Stack>

          <Stack component="section" id="rules" aria-labelledby="rules-heading" gap="md">
            <Stack gap={4}>
              <SectionHeading id="rules-heading" icon={<TopicIcon topic="rules" size={20} />}>
                Rules and variants
              </SectionHeading>
              <Text c="dimmed" size="sm">
                Proposed structured rule sections would make the ruleset useful before the FAQ has
                accumulated questions.
              </Text>
            </Stack>
            <Stack gap="md">
              {[
                [
                  'Setup changes',
                  'Changes to preparation, starting resources, map state, and player count.',
                ],
                [
                  'Core rule changes',
                  'The rules that override or extend the base game during normal play.',
                ],
                [
                  'Victory and end game',
                  'Changed victory conditions, turn limits, tie breakers, or scoring.',
                ],
                [
                  'Optional variants',
                  'Clearly optional modules that groups may enable independently.',
                ],
              ].map(([title, description]) => (
                <Card key={title} withBorder padding="lg" radius="md">
                  <Stack gap="xs">
                    <Title order={3} size="h4">
                      {title}
                    </Title>
                    <Text size="sm" c="dimmed">
                      {description}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Stack>

          <Stack component="section" id="factions" aria-labelledby="factions-heading" gap="md">
            <SectionHeading id="factions-heading" icon={<Layers3 size={20} aria-hidden />}>
              Included factions
            </SectionHeading>
            {page.factions && page.factions.length > 0 ? (
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                {page.factions.map((f) => (
                  <Card key={f.factionId} withBorder padding="md" radius="md">
                    <Group gap="md" wrap="nowrap">
                      <div className={styles.factionToken} aria-hidden>
                        {f.identity ? (
                          <FactionToken logo={f.identity.logo} background={f.identity.background} />
                        ) : (
                          <TopicIcon topic="identity" size={24} />
                        )}
                      </div>
                      <Stack gap={4} miw={0}>
                        <Anchor
                          fw={700}
                          size="lg"
                          renderRoot={(rootProps) => (
                            <Link
                              {...rootProps}
                              to="/factions/$factionId"
                              params={{ factionId: f.urlSlug }}
                            />
                          )}
                        >
                          {f.name}
                        </Anchor>
                        <Text size="sm" c="dimmed">
                          View faction details, components, and special rules.
                        </Text>
                      </Stack>
                    </Group>
                  </Card>
                ))}
              </SimpleGrid>
            ) : (
              <Paper withBorder p="lg" radius="md">
                <Text c="dimmed">No factions have been added to this ruleset yet.</Text>
              </Paper>
            )}
          </Stack>
        </Stack>

        <Stack
          component="section"
          id="faq"
          aria-labelledby="faq-heading"
          gap="md"
          className={styles.communityColumn}
        >
          <Stack gap={4}>
            <SectionHeading id="faq-heading" icon={<CircleHelp size={20} aria-hidden />}>
              Community FAQ
            </SectionHeading>
            <Text size="sm" c="dimmed">
              Browse community questions and accepted answers.
            </Text>
          </Stack>
          <TextInput
            value={search.q ?? ''}
            onChange={(event) => handleFaqSearchChange(event.currentTarget.value)}
            placeholder="Search questions…"
            aria-label="Search FAQ questions"
            leftSection={<Search size={16} aria-hidden />}
            leftSectionPointerEvents="none"
            rightSectionWidth="8rem"
            rightSectionPointerEvents="all"
            size="md"
            radius="md"
            classNames={{ wrapper: styles.faqFilterWrapper }}
            rightSection={
              <Select
                value={search.tag ?? '__all__'}
                onChange={handleFaqTagChange}
                data={[
                  { value: '__all__', label: 'All tags' },
                  ...FAQ_TAG_VALUES.map((tag) => ({
                    value: tag,
                    label: FAQ_TAG_LABELS[tag],
                  })),
                ]}
                aria-label="Filter FAQ by tag"
                allowDeselect={false}
                variant="unstyled"
                size="sm"
                rightSectionWidth="2rem"
                comboboxProps={{ shadow: 'md' }}
                classNames={{
                  root: styles.faqTagSelect,
                  wrapper: styles.faqTagSelectWrapper,
                  input: styles.faqTagSelectInput,
                }}
              />
            }
          />
          <FaqList
            items={page.faqItems}
            rulesetSlug={r.slug}
            searchQuery={search.q ?? ''}
            selectedTag={search.tag}
          />
        </Stack>

        <Stack
          gap="md"
          component="aside"
          aria-label="Ruleset details"
          miw={0}
          className={styles.detailsColumn}
        >
          <Card withBorder padding="lg" radius="md">
            <Stack gap="md">
              <SectionHeading icon={<ListTree size={19} aria-hidden />} order={2}>
                At a glance
              </SectionHeading>
              <Group gap="lg" wrap="wrap">
                <IconStat
                  icon={<Layers3 size={17} aria-hidden />}
                  value={page.factions?.length ?? 0}
                  label={`${page.factions?.length ?? 0} ${(page.factions?.length ?? 0) === 1 ? 'faction' : 'factions'}`}
                />
                <IconStat
                  icon={<CircleHelp size={17} aria-hidden />}
                  value={page.faqItems.length}
                  label={`${page.faqItems.length} ${page.faqItems.length === 1 ? 'question' : 'questions'}`}
                />
                <IconStat
                  icon={<CheckCircle2 size={17} aria-hidden />}
                  value={answeredFaqCount}
                  label={`${answeredFaqCount} answered ${answeredFaqCount === 1 ? 'question' : 'questions'}`}
                />
                <IconStat
                  icon={<FileText size={17} aria-hidden />}
                  value="—"
                  label="Version not specified"
                />
              </Group>
            </Stack>
          </Card>

          <Card withBorder padding="lg" radius="md">
            <Stack gap="md">
              <SectionHeading icon={<UsersRound size={19} aria-hidden />} order={2}>
                Stewardship
              </SectionHeading>
              <Stack gap="sm">
                <Box>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                    Owner
                  </Text>
                  {page.owner ? (
                    <ProfileLink
                      slug={page.owner.slug}
                      username={page.owner.username}
                      avatar_url={page.owner.avatar_url}
                    />
                  ) : (
                    <Text size="sm">Unknown</Text>
                  )}
                </Box>
                <Divider />
                {r.group_id == null ? (
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
                    {canRequestMembership ? (
                      <Button
                        type="button"
                        variant="light"
                        leftSection={<UserPlus size={16} aria-hidden />}
                        loading={requestMembership.isPending}
                        onClick={() => requestMembership.mutate(assignedGroup._id)}
                      >
                        Request membership
                      </Button>
                    ) : null}
                  </Stack>
                )}
              </Stack>
            </Stack>
          </Card>

          <Card withBorder padding="lg" radius="md">
            <Stack gap="sm">
              <SectionHeading icon={<FileText size={19} aria-hidden />} order={2}>
                Resources
              </SectionHeading>
              <Badge variant="light" color="gray" w="fit-content">
                Proposed content
              </Badge>
              <Text size="sm" c="dimmed">
                Printable rules, release notes, and a version history could live here.
              </Text>
            </Stack>
          </Card>
        </Stack>
      </Box>
    </PageLayout>
  );
}

function SectionHeading({
  icon,
  children,
  order = 2,
  ...props
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  order?: 2 | 3;
} & React.ComponentProps<typeof Group>) {
  return (
    <Group gap="xs" wrap="nowrap" c="var(--color-text, var(--mantine-color-text))" {...props}>
      <Title order={order} size={order === 2 ? 'h3' : 'h4'}>
        {children}
      </Title>
      {icon}
    </Group>
  );
}

import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Image,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { Eyebrow } from '@ui/content/Eyebrow';
import { StatusBadge } from '@ui/content/StatusBadge';
import { Stats } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Spotlight } from '@ui/surface/Spotlight';
import { Toolbar } from '@ui/surface/Toolbar';
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

import { useGroupMembershipWorkflow } from '@db/members';
import { useCurrentProfile } from '@db/profiles';
import {
  loadRulesetDetailPage,
  useDeleteRuleset,
  useRulesetDetailPage,
  useUpdateRuleset,
} from '@db/rulesets';
import { viewerActionsFor } from '@app/access/viewerActions';
import { ProposedContent } from '@app/components/block/ProposedContent';
import { ProfileLink } from '@app/components/content/ProfileLink';
import { TopicIcon } from '@app/components/content/TopicIcon';
import { GroupAssignPopover } from '@app/components/control/GroupAssignPopover';
import { PageLayout } from '@app/components/layout/PageLayout';
import { FaqList } from '@app/components/list/FaqList';
import { FAQ_TAG_LABELS, FAQ_TAG_VALUES } from '@app/faq/tags';
import type { FaqTag } from '@app/faq/tags';
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
      <Surface padding="xl">
        <Stack gap="xs">
          <Title order={2}>Loading ruleset</Title>
          <Text c="dimmed">The ruleset details are still loading.</Text>
        </Stack>
      </Surface>
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
  const pageQuery = useRulesetDetailPage(rulesetSlug, { initialData: detailSeed });
  const page = pageQuery.data;
  const profile = useCurrentProfile();
  const deleteRuleset = useDeleteRuleset();
  const updateRuleset = useUpdateRuleset();
  const assignRulesetGroup = useUpdateRuleset();
  const membershipWorkflow = useGroupMembershipWorkflow();

  if (loaderData.notFound || !page) {
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
        <Surface padding="xl">
          <Stack gap="xs">
            <Title order={2}>Ruleset not found</Title>
            <Text c="dimmed">This ruleset does not exist or was deleted.</Text>
          </Stack>
        </Surface>
      </PageLayout>
    );
  }

  const viewerAccess = page.viewerAccess;
  if (!viewerAccess) {
    return <RulesetDetailPending />;
  }

  const r = page.ruleset;
  const assignedGroup = viewerAccess.assignedGroup;
  const membershipStatus =
    viewerAccess.viewer.kind === 'authenticated' ? viewerAccess.viewer.membership : 'none';
  const canRequestMembership = viewerAccess.capabilities.requestMembership;
  const answeredFaqCount = page.faqItems.filter((item) => item.accepted_answer_id != null).length;
  const mutationError =
    deleteRuleset.error?.message ??
    membershipWorkflow.request.error?.message ??
    updateRuleset.error?.message;
  const actionVisibility = viewerActionsFor(viewerAccess, {
    hasProfile: Boolean(profile.data?._id),
    subjectGroupId: r.group_id,
  });

  const handleDelete = () => {
    if (!window.confirm(`Delete ruleset "${r.name}"? This cannot be undone.`)) {
      return;
    }
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
          <Surface className={styles.rulesetHeadCover}>
            {r.image_cover ? (
              <Image
                src={r.image_cover}
                fallbackSrc="/image/background/card-large.jpg"
                alt={`Cover for ${r.name}`}
                className={styles.coverImage}
              />
            ) : null}
            <span className={styles.rulesetHeadGlyph}>
              <TopicIcon topic="rulesets" size={28} />
            </span>
          </Surface>
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
        <Toolbar>
          <Toolbar.Left>
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
              {viewerAccess.capabilities.edit ? (
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
          </Toolbar.Left>

          <Toolbar.Right>
            {actionVisibility.askQuestion ||
            actionVisibility.assignGroup ||
            actionVisibility.removeGroup ||
            actionVisibility.canDelete ? (
              <Group gap="xs" wrap="wrap" role="group" aria-label="Ruleset actions">
                {actionVisibility.askQuestion ? (
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
                ) : null}
                {actionVisibility.assignGroup ? (
                  <GroupAssignPopover
                    disabled={assignRulesetGroup.isPending}
                    assignableGroups={page.assignableGroups}
                    onAssignGroup={async (nextGroupId) => {
                      await assignRulesetGroup.mutateAsync({
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
                ) : null}
                {actionVisibility.removeGroup ? (
                  <Tooltip label="Remove group">
                    <ActionIcon
                      type="button"
                      aria-label="Remove group"
                      color="red"
                      variant="light"
                      size="lg"
                      disabled={updateRuleset.isPending}
                      onClick={() =>
                        void updateRuleset
                          .mutateAsync({
                            id: r._id,
                            input: { name: r.name },
                            groupId: null,
                            imageCover: r.image_cover ?? null,
                          })
                          .catch(() => undefined)
                      }
                    >
                      <UserRoundMinus size={17} aria-hidden />
                    </ActionIcon>
                  </Tooltip>
                ) : null}
                {actionVisibility.canDelete ? (
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
                ) : null}
              </Group>
            ) : null}
          </Toolbar.Right>
        </Toolbar>
      }
    >
      <Box className={styles.detailGrid}>
        <Stack gap="xl" className={styles.primaryColumn}>
          {mutationError ? (
            <Alert color="red" title="The change could not be saved" role="alert">
              {mutationError}
            </Alert>
          ) : null}

          <Section
            id="overview"
            icon={<BookOpen size={20} aria-hidden />}
            title="About this ruleset"
          >
            <Surface padding="lg">
              <ProposedContent label="Planned content · new fields required">
                <Text>
                  A concise introduction explaining the ruleset&apos;s purpose, intended audience,
                  and how it differs from the base game.
                </Text>
                <Text c="dimmed">
                  Compatibility should identify the base edition or parent ruleset, required
                  expansions, and whether this ruleset can be mixed with other variants.
                </Text>
              </ProposedContent>
            </Surface>
          </Section>

          <Section
            id="rules"
            icon={<TopicIcon topic="rules" size={20} />}
            title="Rules and variants"
            description="Proposed structured rule sections would make the ruleset useful before the FAQ has accumulated questions."
          >
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
                <Card key={title} title={title}>
                  <Text size="sm" c="dimmed">
                    {description}
                  </Text>
                </Card>
              ))}
            </Stack>
          </Section>

          <Section id="factions" icon={<Layers3 size={20} aria-hidden />} title="Included factions">
            {page.factions.length > 0 ? (
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                {page.factions.map((f) => (
                  <Spotlight
                    key={f.factionId}
                    media={
                      f.identity ? (
                        <FactionToken logo={f.identity.logo} background={f.identity.background} />
                      ) : (
                        <TopicIcon topic="identity" size={24} />
                      )
                    }
                    title={f.name}
                    meta="Details, components, and special rules"
                    renderRoot={(rootProps) => (
                      <Link
                        {...rootProps}
                        to="/factions/$factionId"
                        params={{ factionId: f.urlSlug }}
                      />
                    )}
                  />
                ))}
              </SimpleGrid>
            ) : (
              <Surface padding="lg">
                <Text size="sm" c="dimmed">
                  No factions have been added to this ruleset yet.
                </Text>
              </Surface>
            )}
          </Section>
        </Stack>

        <Section
          id="faq"
          className={styles.communityColumn}
          icon={<CircleHelp size={20} aria-hidden />}
          title="Community FAQ"
          description="Browse community questions and accepted answers."
        >
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
        </Section>

        <Stack
          gap="md"
          component="aside"
          aria-label="Ruleset details"
          miw={0}
          className={styles.detailsColumn}
        >
          <Card icon={<ListTree size={20} aria-hidden />} title="At a glance">
            <Stats
              items={[
                {
                  key: 'factions',
                  icon: <Layers3 size={17} aria-hidden />,
                  value: page.factions.length,
                  label: `${page.factions.length} ${page.factions.length === 1 ? 'faction' : 'factions'}`,
                },
                {
                  key: 'questions',
                  icon: <CircleHelp size={17} aria-hidden />,
                  value: page.faqItems.length,
                  label: `${page.faqItems.length} ${page.faqItems.length === 1 ? 'question' : 'questions'}`,
                },
                {
                  key: 'answered',
                  icon: <CheckCircle2 size={17} aria-hidden />,
                  value: answeredFaqCount,
                  label: `${answeredFaqCount} answered ${answeredFaqCount === 1 ? 'question' : 'questions'}`,
                },
                {
                  key: 'version',
                  icon: <FileText size={17} aria-hidden />,
                  value: '—',
                  label: 'Version not specified',
                },
              ]}
            />
          </Card>

          <Card icon={<UsersRound size={20} aria-hidden />} title="Stewardship">
            <Stack gap="sm">
              <Box>
                <Eyebrow>Owner</Eyebrow>
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
            </Stack>
          </Card>

          <Card icon={<FileText size={20} aria-hidden />} title="Resources">
            <ProposedContent label="Proposed content">
              <Text size="sm" c="dimmed">
                Printable rules, release notes, and a version history could live here.
              </Text>
            </ProposedContent>
          </Card>
        </Stack>
      </Box>
    </PageLayout>
  );
}

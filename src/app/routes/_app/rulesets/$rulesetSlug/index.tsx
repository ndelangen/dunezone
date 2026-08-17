import { Alert, Anchor, Avatar, Group, Menu, Popover, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { FAQ_TAG_VALUES } from '@shared/faq/tags';
import type { FaqTag } from '@shared/faq/tags';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { FactionCard } from '@ui/block/FactionCard';
import { ProposedContent } from '@ui/block/ProposedContent';
import { Section } from '@ui/block/Section';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { ProfileLink } from '@ui/content/ProfileLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { AssignPopover } from '@ui/control/AssignPopover';
import { IconAction } from '@ui/control/IconAction';
import { ColumnsWithRailLayout } from '@ui/layout/ColumnsWithRailLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { FaqList } from '@ui/list/FaqList';
import { Stats } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  EllipsisVertical,
  FileText,
  Layers3,
  Link2,
  Link2Off,
  MessageCircleQuestionMark,
  Pencil,
  Search,
  Trash2,
  UserRoundMinus,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';

import { useCurrentProfile } from '@db/profiles';
import {
  loadRulesetDetailPage,
  useAddRulesetFaction,
  useDeleteRuleset,
  useRemoveRulesetFaction,
  useRulesetDetailPage,
  useSetRulesetGroup,
} from '@db/rulesets';
import { FactionPicker } from '@app/pickers/FactionPicker';

import styles from '../RulesetDetail.module.css';

/**
 * The toolbar affordance that adds a faction to this ruleset.
 * It owns the open state and nothing else: the picker is mounted only while the popover is open, so its subscription lives exactly that long, which is the contract `AGENTS.md` sets for a Picker's container.
 * The commit is the caller's — this reports the chosen faction's id and closes.
 */
function AddFactionPopover({
  disabled,
  linkedSlugs,
  rulesetName,
  onAdd,
}: {
  disabled: boolean;
  /** Every faction already in this ruleset, so the picker cannot offer a duplicate. */
  linkedSlugs: string[];
  rulesetName: string;
  onAdd: (factionId: string) => void;
}) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={440}
      shadow="md"
      withArrow
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <IconAction
          label="Add a faction"
          variant="filled"
          color="dune"
          size="lg"
          disabled={disabled}
          onClick={() => setOpened((current) => !current)}
          icon={<Link2 size={17} aria-hidden />}
        />
      </Popover.Target>
      <Popover.Dropdown>
        {opened ? (
          <FactionPicker
            excludeSlugs={linkedSlugs}
            copy={{
              title: 'Add a faction',
              intro: `Choose a faction to add to ${rulesetName}. Factions already in it are not listed.`,
              errorTitle: 'Faction could not be added',
              emptyMessage: 'Every faction is already in this ruleset.',
              confirmTitle: `Add this faction to ${rulesetName}?`,
              /* No warning: nothing is overwritten, and the card's own menu takes it straight back out. */
              confirmLabel: 'Add faction',
              confirmColor: 'confirm',
            }}
            onCancel={() => setOpened(false)}
            onPick={(picked) => {
              onAdd(picked.id);
              setOpened(false);
            }}
          />
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * The menu in a faction card's action slot, on the ruleset page.
 * Mantine's `Menu` directly: the theme gives its dropdown the same pane a `Popover` gets, and `color="red"` is how a destructive choice reads, so a wrapper here would only forward props — see the Mantine-component stories in
 * `src/app/ui/control`.
 * A menu rather than a bare button because the card is a link: a menu target is unambiguously not part of the navigation, and further per-faction actions land here rather than crowding the tile.
 * No confirmation — the toolbar's picker puts the faction straight back.
 */
function FactionCardMenu({
  factionName,
  rulesetName,
  disabled,
  onRemove,
}: {
  factionName: string;
  rulesetName: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <Menu position="bottom-end" shadow="md" withinPortal>
      <Menu.Target>
        <IconAction
          label={`Actions for ${factionName}`}
          variant="light"
          color="gray"
          size="sm"
          disabled={disabled}
          icon={<EllipsisVertical size={15} aria-hidden />}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item color="red" leftSection={<Link2Off size={15} aria-hidden />} onClick={onRemove}>
          Remove from {rulesetName}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/')({
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  validateSearch: (params: Record<string, unknown>): { q?: string; tag?: FaqTag } => {
    const q = params?.q;
    const tag = params?.tag;
    return {
      ...(typeof q === 'string' ? { q } : {}),
      ...(typeof tag === 'string' && FAQ_TAG_VALUES.includes(tag as FaqTag) ? { tag: tag as FaqTag } : {}),
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
    <PageLayout>
      <PageLayout.Header>
        <Stack align="center" gap="xs">
          <Title order={1}>Ruleset</Title>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}>Back to rulesets</Anchor>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          <Stack gap="xs">
            <Title order={2}>Loading ruleset</Title>
            <Text c="dimmed">The ruleset details are still loading.</Text>
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

function RulesetDetailError({ error }: ErrorComponentProps) {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack align="center" gap="xs">
          <Title order={1}>Ruleset</Title>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}>Back to rulesets</Anchor>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Alert color="red" title="Ruleset could not be loaded" role="alert">
          <Text size="sm">{error.message || 'An unexpected error occurred.'}</Text>
        </Alert>
      </PageLayout.Content>
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
  const setRulesetGroup = useSetRulesetGroup();
  const addFaction = useAddRulesetFaction();
  const removeFaction = useRemoveRulesetFaction();

  if (loaderData.notFound || !page) {
    return (
      <PageLayout>
        <PageLayout.Header>
          <Stack align="center" gap="xs">
            <Title order={1}>Ruleset</Title>
            <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}>Back to rulesets</Anchor>
          </Stack>
        </PageLayout.Header>
        <PageLayout.Content>
          <Surface padding="xl">
            <Stack gap="xs">
              <Title order={2}>Ruleset not found</Title>
              <Text c="dimmed">This ruleset does not exist or was deleted.</Text>
            </Stack>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  const viewerAccess = page.viewerAccess;
  if (!viewerAccess) {
    return <RulesetDetailPending />;
  }

  const r = page.ruleset;
  const assignedGroup = viewerAccess.assignedGroup;
  const membershipStatus = viewerAccess.viewer.kind === 'authenticated' ? viewerAccess.viewer.membership : 'none';
  const answeredFaqCount = page.faqItems.filter((item) => item.accepted_answer_id != null).length;
  const mutationError =
    deleteRuleset.error?.message ??
    setRulesetGroup.error?.message ??
    addFaction.error?.message ??
    removeFaction.error?.message;
  /**
   * Standing beside the maintaining group, and only when the viewer has a standing worth naming.
   * "Not a member" is the default state of every reader, so saying it would be noise;
   * acting on it belongs to the group's own page.
   */
  const membershipBadge =
    membershipStatus === 'active'
      ? ({ tone: 'positive', label: 'Member' } as const)
      : membershipStatus === 'pending'
        ? ({ tone: 'pending', label: 'Pending' } as const)
        : null;
  /** The three counts the header carries. There is no version field, so no version stat. */
  const headerStats = [
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
  ];
  const canChangeGroup = viewerAccess.capabilities.changeGroup;
  const hasAssignment = r.group_id != null;
  const actionVisibility = {
    askQuestion: Boolean(profile.data?._id),
    canDelete: viewerAccess.capabilities.delete,
    /** Offer assignment only when the ruleset carries no assignment at all. */
    assignGroup: canChangeGroup && !hasAssignment,
    /** Removal stays available for dangling assignments (row assigned, group unresolvable). */
    removeGroup: canChangeGroup && hasAssignment,
  };

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
    <PageLayout>
      <PageLayout.Header size="compact">
        {/*
          The identity pattern the faction and profile detail pages already use: the media sits in its own column, so
          the breadcrumb, the title and the meta line all share one left edge instead of the title starting indented.
        */}
        <Group wrap="nowrap" align="center" gap="md" className={styles.pageHead}>
          {/* The media matches the text block's height rather than a fixed size, so the band reads as one unit. */}
          <div className={styles.pageHeadMedia}>
            <Avatar
              src={r.image_cover}
              alt={`Cover for ${r.name}`}
              name={r.name}
              radius="md"
              size="100%"
              color="dune"
            />
          </div>
          <Stack gap={4} className={styles.pageHeadText}>
            <Anchor size="sm" fw={600} renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}>
              Rulesets
            </Anchor>
            <Title order={1} className={styles.rulesetTitle}>
              {r.name}
            </Title>
            {/*
            One line carrying everything the old "At a glance" and "Stewardship" cards said.
            The sizes are level on purpose: this row centres its children, and a 12px label among 14-16px text reads as
            misaligned even when every box is perfectly centred.
          */}
            <Group gap="sm" wrap="wrap" align="center">
              <Text size="sm" c="dimmed">
                Maintained by
              </Text>
              {page.owner ? (
                <ProfileLink slug={page.owner.slug} username={page.owner.username} avatar_url={page.owner.avatar_url} />
              ) : (
                <Text size="sm">Unknown</Text>
              )}
              {assignedGroup ? (
                <Group gap={6} wrap="nowrap" align="center">
                  {/* A glyph, not an avatar: the `groups` table carries no image, and this only has to say "a group". */}
                  <UsersRound size={15} aria-hidden />
                  <Anchor
                    size="sm"
                    fw={600}
                    /* White, not the accent: this line sits on artwork, where the accent loses against the sand. */
                    c="white"
                    renderRoot={(rootProps) => (
                      <Link {...rootProps} to="/groups/$groupSlug" params={{ groupSlug: assignedGroup.slug }} />
                    )}
                  >
                    {assignedGroup.name}
                  </Anchor>
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  No maintaining group
                </Text>
              )}
              {membershipBadge ? <StatusBadge tone={membershipBadge.tone}>{membershipBadge.label}</StatusBadge> : null}
              <Stats items={headerStats} orientation="row" />
            </Group>
          </Stack>
        </Group>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs" wrap="wrap" role="group" aria-label="Navigation and editing">
              <IconAction
                label="Back to rulesets"
                variant="light"
                color="gray"
                size="lg"
                renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
                icon={<ArrowLeft size={17} aria-hidden />}
              />
              {viewerAccess.capabilities.edit ? (
                <IconAction
                  label="Edit ruleset"
                  variant="light"
                  color="dune"
                  size="lg"
                  renderRoot={(rootProps) => (
                    <Link {...rootProps} to="/rulesets/$rulesetSlug/edit" params={{ rulesetSlug: r.slug }} />
                  )}
                  icon={<Pencil size={17} aria-hidden />}
                />
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
                  <IconAction
                    label="Ask a question"
                    variant="filled"
                    color="confirm"
                    size="lg"
                    onClick={() =>
                      navigate({
                        to: '/rulesets/$rulesetSlug/faq/create',
                        params: { rulesetSlug: r.slug },
                      })
                    }
                    icon={<MessageCircleQuestionMark size={17} aria-hidden />}
                  />
                ) : null}
                {viewerAccess.capabilities.edit ? (
                  <AddFactionPopover
                    disabled={addFaction.isPending}
                    linkedSlugs={page.factions.map((faction) => faction.slug)}
                    rulesetName={r.name}
                    onAdd={(factionId) => addFaction.mutate({ rulesetId: r._id, factionId })}
                  />
                ) : null}
                {actionVisibility.assignGroup ? (
                  <AssignPopover
                    noun="group"
                    triggerLabel="Assign group"
                    icon={<UsersRound size={17} aria-hidden />}
                    disabled={setRulesetGroup.isPending}
                    options={page.assignableGroups.map((group) => ({
                      value: group.id,
                      label: `${group.name} (${group.slug})`,
                    }))}
                    onAssign={async (nextGroupId) => {
                      await setRulesetGroup.mutateAsync({ id: r._id, groupId: nextGroupId });
                    }}
                    title="Assign Group"
                    descriptionLines={[
                      `Assign a group that can help maintain "${r.name}".`,
                      'You can create and join groups from your profile.',
                    ]}
                  />
                ) : null}
                {actionVisibility.removeGroup ? (
                  <IconAction
                    label="Remove group"
                    color="red"
                    variant="light"
                    size="lg"
                    disabled={setRulesetGroup.isPending}
                    onClick={() =>
                      void setRulesetGroup.mutateAsync({ id: r._id, groupId: null }).catch(() => undefined)
                    }
                    icon={<UserRoundMinus size={17} aria-hidden />}
                  />
                ) : null}
                {actionVisibility.canDelete ? (
                  <IconAction
                    label="Delete ruleset"
                    color="red"
                    variant="light"
                    size="lg"
                    onClick={handleDelete}
                    disabled={deleteRuleset.isPending}
                    icon={<Trash2 size={17} aria-hidden />}
                  />
                ) : null}
              </Group>
            ) : null}
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <ColumnsWithRailLayout>
          <ColumnsWithRailLayout.Primary>
            <Stack gap="xl">
              {mutationError ? (
                <Alert color="red" title="The change could not be saved" role="alert">
                  {mutationError}
                </Alert>
              ) : null}

              {/*
                Nothing at all when the description is empty, which is every ruleset that predates the field.
                An empty pane saying nothing is worse than the space it would occupy;
                the owner is prompted by the settings form, not by a placeholder here.
              */}
              {r.description ? (
                <Section id="overview" icon={<BookOpen size={20} aria-hidden />} title="About this ruleset">
                  <Surface padding="lg">
                    {/* Authored in a textarea, so its own line breaks are the only structure it has. */}
                    <Text className={styles.description}>{r.description}</Text>
                  </Surface>
                </Section>
              ) : null}

              <Card icon={<FileText size={20} aria-hidden />} title="Resources">
                <ProposedContent label="Proposed content">
                  <Text size="sm" c="dimmed">
                    Printable rules, release notes, and a version history could live here.
                  </Text>
                </ProposedContent>
              </Card>
            </Stack>
          </ColumnsWithRailLayout.Primary>

          <ColumnsWithRailLayout.Secondary>
            <Section
              id="faq"
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
                onOpenQuestion={(questionSlug) =>
                  navigate({
                    to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                    params: { rulesetSlug: r.slug, questionSlug },
                  })
                }
              />
            </Section>
          </ColumnsWithRailLayout.Secondary>

          <ColumnsWithRailLayout.Rail>
            <Section id="factions" icon={<Layers3 size={20} aria-hidden />} title="Included factions">
              {page.factions.length > 0 ? (
                <Stack gap="md">
                  {page.factions.map((faction) => (
                    <FactionCard
                      key={faction._id}
                      faction={faction}
                      action={
                        viewerAccess.capabilities.edit ? (
                          <FactionCardMenu
                            factionName={faction.data.name}
                            rulesetName={r.name}
                            disabled={removeFaction.isPending}
                            onRemove={() => removeFaction.mutate({ rulesetId: r._id, factionId: faction._id })}
                          />
                        ) : null
                      }
                    />
                  ))}
                </Stack>
              ) : (
                <Surface padding="lg">
                  <Text size="sm" c="dimmed">
                    No factions have been added to this ruleset yet.
                  </Text>
                </Surface>
              )}
            </Section>
          </ColumnsWithRailLayout.Rail>
        </ColumnsWithRailLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}

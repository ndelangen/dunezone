import { Alert, Avatar, Group, Menu, Popover, Select, Stack, Text, TextInput } from '@mantine/core';
import { FAQ_TAG_VALUES } from '@shared/faq/tags';
import type { FaqTag } from '@shared/faq/tags';
import { isRouteNoticeCode } from '@shared/routeNotices';
import type { RouteNoticeCode } from '@shared/routeNotices';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { FactionCard } from '@ui/block/FactionCard';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageIdentity } from '@ui/block/PageIdentity';
import { ProposedContent } from '@ui/block/ProposedContent';
import { Section } from '@ui/block/Section';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { GroupLink } from '@ui/content/GroupLink';
import { ProfileLink } from '@ui/content/ProfileLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssignOptions, AssignPopover } from '@ui/control/AssignPopover';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
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
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { FactionPicker } from '@app/pickers/FactionPicker';
import { resolveRouteNotice } from '@app/routes/-routeNotices';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from '../RulesetDetail.module.css';

/**
 * The toolbar affordance that adds a faction to this ruleset.
 * It owns the open state and nothing else: the picker is mounted only while the popover is open, so its subscription lives exactly that long, which is the contract `AGENTS.md` sets for a Picker's container.
 * The commit is the caller's;
 * this reports the chosen faction's id and closes.
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
      /* A 440px pane over a 40px trigger is slid by `shift` to fit, and a side-anchored arrow goes with the pane rather than staying on the control that opened it (#715). */
      arrowPosition="center"
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <IconAction
          label="Add a faction"
          variant="filled"
          color="gray"
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
 * Mantine's `Menu` directly: the theme gives its dropdown the same pane a `Popover` gets, and `color="red"` is how a destructive choice reads, so a wrapper here would only forward props.
 * See the Mantine-component stories in `src/app/ui/control`.
 * A menu rather than a bare button because the card is a link: a menu target is unambiguously not part of the navigation, and further per-faction actions land here rather than crowding the tile.
 * No confirmation: the toolbar's picker puts the faction straight back.
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
  validateSearch: (params: Record<string, unknown>): { q?: string; tag?: FaqTag; notice?: RouteNoticeCode } => {
    const q = params?.q;
    const tag = params?.tag;
    const notice = params?.notice;
    return {
      ...(typeof q === 'string' ? { q } : {}),
      ...(typeof tag === 'string' && FAQ_TAG_VALUES.includes(tag as FaqTag) ? { tag: tag as FaqTag } : {}),
      ...(isRouteNoticeCode(notice) ? { notice } : {}),
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

const backToRulesets = <PageMessage.Back to="/rulesets">Back to rulesets</PageMessage.Back>;

function RulesetDetailPending() {
  return (
    <PageMessage title="Ruleset" back={backToRulesets}>
      <LoadPending title="Loading ruleset">The ruleset details are still loading.</LoadPending>
    </PageMessage>
  );
}

function RulesetDetailError({ error }: ErrorComponentProps) {
  return (
    <PageMessage title="Ruleset" back={backToRulesets}>
      <LoadError title="Ruleset could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
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
  const routeNotice = resolveRouteNotice(search.notice);

  if (loaderData.notFound || !page) {
    return (
      <PageMessage title="Ruleset" back={backToRulesets}>
        <NotAvailable title="Ruleset not found">This ruleset does not exist or was deleted.</NotAvailable>
      </PageMessage>
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
  const dismissRouteNotice = () =>
    navigate({
      to: '.',
      search: (previous) => ({ ...previous, notice: undefined }),
      replace: true,
    });
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
        <PageIdentity
          title={r.name}
          media={
            <Avatar
              src={r.coverThumbUrl}
              alt={`Cover for ${r.name}`}
              name={r.name}
              radius="md"
              size="100%"
              color="dune"
            />
          }
          breadcrumb={<PageIdentity.Breadcrumb to="/rulesets">Rulesets</PageIdentity.Breadcrumb>}
        >
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
              <GroupLink slug={assignedGroup.slug} name={assignedGroup.name} />
            ) : (
              <Text size="sm" c="dimmed">
                No maintaining group
              </Text>
            )}
            {membershipBadge ? <StatusBadge tone={membershipBadge.tone}>{membershipBadge.label}</StatusBadge> : null}
            <Stats items={headerStats} orientation="row" />
          </Group>
        </PageIdentity>
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
                  color="gray"
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
                    title="Assign Group"
                  >
                    <AssignOptions
                      options={page.assignableGroups.map((group) => ({
                        value: group.id,
                        label: `${group.name} (${group.slug})`,
                      }))}
                      onAssign={async (nextGroupId) => {
                        await setRulesetGroup.mutateAsync({ id: r._id, groupId: nextGroupId });
                      }}
                    />
                  </AssignPopover>
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
                  <ConfirmDeleteAction
                    label="Delete ruleset"
                    pending={deleteRuleset.isPending}
                    onConfirm={handleDelete}
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
              {routeNotice ? (
                <Alert
                  color={routeNotice.color}
                  title={routeNotice.title}
                  role="alert"
                  withCloseButton
                  onClose={dismissRouteNotice}
                >
                  {routeNotice.message}
                </Alert>
              ) : null}
              {mutationError ? (
                <Alert color="red" title="The change could not be saved" role="alert">
                  {mutationError}
                </Alert>
              ) : null}

              <Section id="overview" icon={<TopicIcon topic="about" size={20} />} title="About this ruleset">
                <Surface padding="lg">
                  {r.about.trim() ? (
                    <FormattedTextSource source={r.about} />
                  ) : (
                    <Text size="sm" c="dimmed" fs="italic">
                      Nothing written about this yet.
                    </Text>
                  )}
                </Surface>
              </Section>

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
                emptyLabel="No FAQ items yet."
                noMatchesLabel="No questions match your search."
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
            <Section id="factions" icon={<Layers3 size={20} aria-hidden />} title="Factions">
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

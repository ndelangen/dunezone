import { useAuthActions } from '@convex-dev/auth/react';
import { Anchor, Group, Pagination, Stack, Text } from '@mantine/core';
import { parseProfileFaqPages } from '@shared/profiles/faqActivity';
import type { ProfileFaqPages } from '@shared/profiles/faqActivity';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, notFound, redirect, Link, useNavigate } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageIdentity } from '@ui/block/PageIdentity';
import { ProposedContent } from '@ui/block/ProposedContent';
import { Section } from '@ui/block/Section';
import { errorMessage } from '@ui/content/errorMessage';
import { GroupLink } from '@ui/content/GroupLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { FactionList } from '@ui/list/FactionList';
import { FaqList } from '@ui/list/FaqList';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Link2,
  LogOut,
  MessageCircleReply,
  Pencil,
  Shield,
  UserPlus,
  UsersRound,
} from 'lucide-react';

import { isPublicPageNotFound, loadPublicPage } from '@db/core/publicPage';
import { forgetStoredPlayTables } from '@db/playTables';
import type { ProfilePageData } from '@db/profiles';
import { loadProfileBySlug, profileAvatarUrl, useCurrentProfile, useProfileBySlug } from '@db/profiles';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { publicPageHead, useLivePageTitle } from '@app/routes/publicPage';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';
import { profileDescription } from './profileDescription';

export const Route = createFileRoute('/_app/profiles/$profileSlug/')({
  ssr: true,
  validateSearch: parseProfileFaqPages,
  loaderDeps: ({ search }) => parseProfileFaqPages(search),
  loader: async ({ params, deps }) => {
    const profilePage = await loadPublicPage(loadProfileBySlug(params.profileSlug, deps));
    if (!profilePage) {
      throw notFound();
    }
    if (profilePage.profile.slug !== params.profileSlug) {
      throw redirect({
        to: '/profiles/$profileSlug',
        params: { profileSlug: profilePage.profile.slug },
        search: deps,
        replace: true,
        statusCode: 301,
      });
    }
    return { profilePage };
  },
  errorComponent: ProfileDetailError,
  head: ({ loaderData, params, match }) =>
    publicPageHead({
      name: loaderData?.profilePage.profile.username ?? 'Profile',
      kind: loaderData ? 'Profile' : undefined,
      pathname: `/profiles/${encodeURIComponent(params.profileSlug)}`,
      description: loaderData
        ? profileDescription({
            username: loaderData.profilePage.profile.username,
            factions: loaderData.profilePage.factions.length,
            groups: loaderData.profilePage.groupSummaries.length,
            faqContributions: loaderData.profilePage.faqAsked.length + loaderData.profilePage.faqAnswers.length,
          })
        : '',
      image: loaderData?.profilePage.profile.avatar?.url,
      social: { shape: 'round' },
      trail: [{ name: 'Profiles', pathname: '/profiles' }],
      entity: { type: 'person' },
      match,
    }),
  component: ProfileDetailPage,
});

const backToProfiles = <PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>;

/**
 * The frame for a load that failed, most often a slug naming no profile.
 * The loader throws rather than returning nothing, so the component's absent branch below never sees that case and the reader met the router's unstyled default instead.
 */
function ProfileDetailError({ error }: ErrorComponentProps) {
  if (isPublicPageNotFound(error)) {
    return (
      <PageMessage size="compact" title="Profile" back={backToProfiles}>
        <NotAvailable title="Profile not found">This profile does not exist or was deleted.</NotAvailable>
      </PageMessage>
    );
  }
  return (
    <PageMessage size="compact" title="Profile" back={backToProfiles}>
      <LoadError title="Profile could not be loaded" stale={isStaleClientData(error)}>
        {errorMessage(error)}
      </LoadError>
    </PageMessage>
  );
}

/** Both activity sections compose the standard question list and independent page controls. */
function ProfileFaqActivity({
  lists,
  profileSlug,
  search,
  onOpenQuestion,
  onPageChange,
}: {
  lists: ProfilePageData['faqLists'];
  profileSlug: string;
  search: ProfileFaqPages;
  onOpenQuestion: (questionSlug: string, rulesetSlug: string) => void;
  onPageChange: (key: keyof ProfileFaqPages, page: number) => void;
}) {
  const sections = [
    {
      key: 'answered' as const,
      searchKey: 'answeredPage' as const,
      title: 'Questions answered',
      icon: <MessageCircleReply size={20} aria-hidden />,
      emptyLabel: 'No FAQ answers yet.',
    },
    {
      key: 'asked' as const,
      searchKey: 'askedPage' as const,
      title: 'Questions asked',
      icon: <CircleHelp size={20} aria-hidden />,
      emptyLabel: 'No questions asked yet.',
    },
  ];
  return sections.map(({ key, searchKey, title, icon, emptyLabel }) => {
    const activity = lists[key];
    return (
      <Section key={key} icon={icon} title={title}>
        <FaqList items={activity.items} emptyLabel={emptyLabel} onOpenQuestion={onOpenQuestion} />
        {activity.pageCount > 1 ? (
          <Pagination
            value={activity.page}
            total={activity.pageCount}
            aria-label={`${title} pages`}
            onChange={(page) => onPageChange(searchKey, page)}
            getItemProps={(page) => ({
              component: Link,
              to: '/profiles/$profileSlug',
              params: { profileSlug },
              search: parseProfileFaqPages({ ...search, [searchKey]: page }),
            })}
          />
        ) : null}
      </Section>
    );
  });
}

function ProfileDetailPage() {
  const { profileSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const search = Route.useSearch();
  const profileQuery = useProfileBySlug(profileSlug, { initialData: loaderData.profilePage, pages: search });
  const page = profileQuery.data;
  useLivePageTitle(page?.profile.username ?? undefined, 'Profile');
  const currentProfile = useCurrentProfile();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  if (!page) {
    return (
      <PageMessage size="compact" title="Profile" back={backToProfiles}>
        <NotAvailable title="Profile not found">This profile does not exist or was deleted.</NotAvailable>
      </PageMessage>
    );
  }

  const isSelf = currentProfile.data?._id === page.profile._id;
  const bandAvatarUrl = profileAvatarUrl(page.profile);
  const initials =
    page.profile.username
      ?.slice(0, 2)
      .toUpperCase()
      .replace(/[^A-Z]/g, '') || '?';

  const handleSignOut = async () => {
    forgetStoredPlayTables();
    await signOut();
    await navigate({ to: '/auth/login' });
  };

  const acceptedAnswerCount = page.acceptedAnswerCount;
  const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  /** The five counts the header carries, in place of the old "At a glance" card. */
  const headerStats = [
    {
      key: 'factions',
      icon: <Shield size={17} aria-hidden />,
      value: page.factions.length,
      label: count(page.factions.length, 'faction', 'factions'),
    },
    {
      key: 'groups',
      icon: <UsersRound size={17} aria-hidden />,
      value: page.groupSummaries.length,
      label: count(page.groupSummaries.length, 'group', 'groups'),
    },
    {
      key: 'answers',
      icon: <MessageCircleReply size={17} aria-hidden />,
      value: page.faqAnswers.length,
      label: count(page.faqAnswers.length, 'answer', 'answers'),
    },
    {
      key: 'picked',
      icon: <CheckCircle2 size={17} aria-hidden />,
      value: acceptedAnswerCount,
      label: count(acceptedAnswerCount, 'picked answer', 'picked answers'),
    },
    {
      key: 'questions',
      icon: <CircleHelp size={17} aria-hidden />,
      value: page.faqAsked.length,
      label: count(page.faqAsked.length, 'question', 'questions'),
    },
  ];

  const toolbar = (
    <Toolbar>
      <Toolbar.Left label="Navigation">
        <IconAction
          label="Back to profiles"
          emphasis="standard"
          intent="neutral"
          size="lg"
          renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
          icon={<ArrowLeft size={17} aria-hidden />}
        />
        {isSelf ? (
          <IconAction
            label="Edit profile"
            emphasis="standard"
            intent="neutral"
            size="lg"
            renderRoot={(rootProps) => (
              <Link {...rootProps} to="/profiles/$profileSlug/edit" params={{ profileSlug }} />
            )}
            icon={<Pencil size={17} aria-hidden />}
          />
        ) : null}
      </Toolbar.Left>
      {isSelf ? (
        <Toolbar.Right label="Profile actions">
          <Toolbar.Cluster kind="content">
            <IconAction
              label="Start group"
              emphasis="strong"
              intent="positive"
              size="lg"
              renderRoot={(rootProps) => <Link {...rootProps} to="/groups/create" />}
              icon={<UserPlus size={17} aria-hidden />}
            />
          </Toolbar.Cluster>
          <Toolbar.Cluster kind="access">
            <IconAction
              label="Log out"
              emphasis="standard"
              intent="neutral"
              size="lg"
              onClick={() => void handleSignOut()}
              icon={<LogOut size={17} aria-hidden />}
            />
          </Toolbar.Cluster>
        </Toolbar.Right>
      ) : null}
    </Toolbar>
  );

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageIdentity
          title={page.profile.username ?? 'Unknown'}
          media={
            bandAvatarUrl ? (
              <img src={bandAvatarUrl} alt={page.profile.username ?? 'Avatar'} className={styles.avatar} />
            ) : (
              <span className={styles.avatarPlaceholder}>{initials}</span>
            )
          }
          breadcrumb={<PageIdentity.Breadcrumb to="/profiles">Profiles</PageIdentity.Breadcrumb>}
          standing={isSelf ? { tone: 'brand', label: 'You' } : null}
          stats={headerStats}
        >
          <Text size="sm" c="dimmed">
            Member since{' '}
            <time dateTime={page.profile.created_at}>
              {new Intl.DateTimeFormat('en', {
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(page.profile.created_at))}
            </time>
          </Text>
        </PageIdentity>
      </PageLayout.Header>
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <div className={styles.contentColumns}>
          <Stack gap="md" className={styles.mainColumn}>
            <Section icon={<Shield size={20} aria-hidden />} title="Factions created">
              {page.factions.length > 0 ? (
                <FactionList factions={page.factions} />
              ) : (
                <Surface padding="lg">
                  <Text size="sm" c="dimmed">
                    No factions created yet.
                  </Text>
                </Surface>
              )}
            </Section>

            <Section icon={<TopicIcon topic="rulesets" size={20} />} title="Rulesets maintained">
              <Surface padding="lg">
                <ProposedContent label="Proposed content · page query required">
                  <Text size="sm" c="dimmed">
                    Rulesets owned or maintained by this contributor would appear here.
                  </Text>
                </ProposedContent>
              </Surface>
            </Section>

            <ProfileFaqActivity
              lists={page.faqLists}
              profileSlug={profileSlug}
              search={search}
              onOpenQuestion={(questionSlug, rulesetSlug) =>
                void navigate({
                  to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                  params: { questionSlug, rulesetSlug },
                })
              }
              onPageChange={(key, page) =>
                void navigate({
                  to: '/profiles/$profileSlug',
                  params: { profileSlug },
                  search: parseProfileFaqPages({ ...search, [key]: page }),
                })
              }
            />
          </Stack>

          <aside className={styles.sidebar} aria-label="Profile details">
            <Stack gap="sm">
              {page.profile.bgg_profile_url ? (
                <Card icon={<Link2 size={20} aria-hidden />} title="BoardGameGeek">
                  <Group gap="sm">
                    <Anchor href={page.profile.bgg_profile_url} target="_blank" rel="noopener noreferrer">
                      View BGG profile
                    </Anchor>
                    <StatusBadge>Unverified</StatusBadge>
                  </Group>
                </Card>
              ) : null}
              <Card icon={<Link2 size={20} aria-hidden />} title="About">
                <ProposedContent label="Proposed profile fields">
                  <Text size="sm" c="dimmed">
                    A short bio and a small set of relevant external links could live here.
                  </Text>
                </ProposedContent>
              </Card>

              <Card icon={<UsersRound size={20} aria-hidden />} title="Groups">
                {page.groupSummaries.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Not a member of any groups.
                  </Text>
                ) : (
                  <Stack gap="xs" align="flex-start">
                    {page.groupSummaries.map((group) => (
                      <GroupLink key={group.id} slug={group.slug} name={group.name} />
                    ))}
                  </Stack>
                )}
              </Card>
            </Stack>
          </aside>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

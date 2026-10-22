import { useAuthActions } from '@convex-dev/auth/react';
import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
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
import { ProfileAnswerList } from '@ui/list/ProfileAnswerList';
import { ProfileQuestionList } from '@ui/list/ProfileQuestionList';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  ArrowRight,
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
import type { ReactElement, ReactNode } from 'react';

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
  loader: async ({ params }) => {
    const profilePage = await loadPublicPage(loadProfileBySlug(params.profileSlug));
    if (!profilePage) {
      throw notFound();
    }
    if (profilePage.profile.slug !== params.profileSlug) {
      throw redirect({
        to: '/profiles/$profileSlug',
        params: { profileSlug: profilePage.profile.slug },
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
            factions: loaderData.profilePage.factionCount,
            groups: loaderData.profilePage.groupSummaries.length,
            faqContributions: loaderData.profilePage.questionCount + loaderData.profilePage.answerCount,
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

/**
 * One section's content: the first few rows and, when the member has more, the link to all of them;
 * or what to say when the member has none.
 * The link is a button rather than a count beside the heading, so the reader meets it at the end of the slice, where the list stops short.
 */
function SectionPreview({
  shown,
  total,
  noun,
  emptyLabel,
  link,
  children,
}: {
  shown: number;
  total: number;
  /** The rows, plural and lower case: "factions", "answers". */
  noun: string;
  emptyLabel: string;
  /** The link to the whole list, rendered as the button's root. */
  link: (props: object) => ReactElement;
  children: ReactNode;
}) {
  if (shown === 0) {
    return (
      <Surface padding="lg">
        <Text size="sm" c="dimmed">
          {emptyLabel}
        </Text>
      </Surface>
    );
  }
  /* The list keeps the section's full width; only the button sits at the start of its own row. */
  return (
    <Stack gap="sm">
      {children}
      {total > shown ? (
        <Group>
          <Button variant="default" rightSection={<ArrowRight size={16} aria-hidden />} renderRoot={link}>
            All {total} {noun}
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}

/** The member's contributions, each section the first few of one list with the way to the rest. */
function ProfileSections({ page }: { page: ProfilePageData }) {
  const params = { profileSlug: page.profile.slug };
  return (
    <>
      <Section icon={<Shield size={20} aria-hidden />} title="Factions created">
        <SectionPreview
          shown={page.factionPreview.length}
          total={page.factionCount}
          noun="factions"
          emptyLabel="No factions created yet."
          link={(props) => <Link {...props} to="/factions" search={{ owner: page.profile.slug }} />}
        >
          <FactionList factions={page.factionPreview} />
        </SectionPreview>
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

      <Section icon={<MessageCircleReply size={20} aria-hidden />} title="Answers contributed">
        <SectionPreview
          shown={page.answerPreview.length}
          total={page.answerCount}
          noun="answers"
          emptyLabel="No FAQ answers yet."
          link={(props) => <Link {...props} to="/profiles/$profileSlug/answers" params={params} />}
        >
          <ProfileAnswerList items={page.answerPreview} viewedProfileId={page.profile._id} />
        </SectionPreview>
      </Section>

      <Section icon={<CircleHelp size={20} aria-hidden />} title="Questions asked">
        <SectionPreview
          shown={page.questionPreview.length}
          total={page.questionCount}
          noun="questions"
          emptyLabel="No questions asked yet."
          link={(props) => <Link {...props} to="/profiles/$profileSlug/questions" params={params} />}
        >
          <ProfileQuestionList items={page.questionPreview} />
        </SectionPreview>
      </Section>
    </>
  );
}

function ProfileDetailPage() {
  const { profileSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const profileQuery = useProfileBySlug(profileSlug, { initialData: loaderData.profilePage });
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

  const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  /** The five counts the header carries, in place of the old "At a glance" card; each is its list's whole count, not the slice shown. */
  const headerStats = [
    {
      key: 'factions',
      icon: <Shield size={17} aria-hidden />,
      value: page.factionCount,
      label: count(page.factionCount, 'faction', 'factions'),
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
      value: page.answerCount,
      label: count(page.answerCount, 'answer', 'answers'),
    },
    {
      key: 'picked',
      icon: <CheckCircle2 size={17} aria-hidden />,
      value: page.pickedAnswerCount,
      label: count(page.pickedAnswerCount, 'picked answer', 'picked answers'),
    },
    {
      key: 'questions',
      icon: <CircleHelp size={17} aria-hidden />,
      value: page.questionCount,
      label: count(page.questionCount, 'question', 'questions'),
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
            <ProfileSections page={page} />
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

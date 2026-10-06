import { useAuthActions } from '@convex-dev/auth/react';
import { Stack, Text } from '@mantine/core';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, notFound, Link, useNavigate } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageIdentity } from '@ui/block/PageIdentity';
import { ProposedContent } from '@ui/block/ProposedContent';
import { Section } from '@ui/block/Section';
import { formatStableDate } from '@ui/content/dates';
import { FormattedTextSource, InlineFormattedTextSource } from '@ui/content/FormattedText';
import { GroupLink } from '@ui/content/GroupLink';
import { ProfileLink } from '@ui/content/ProfileLink';
import { RulesetLink } from '@ui/content/RulesetLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { FactionList } from '@ui/list/FactionList';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
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

export const Route = createFileRoute('/_app/profiles/$profileSlug/')({
  ssr: true,
  loader: async ({ params }) => {
    const profilePage = await loadPublicPage(loadProfileBySlug(params.profileSlug));
    if (!profilePage) {
      throw notFound();
    }
    return { profilePage };
  },
  errorComponent: ProfileDetailError,
  head: ({ loaderData, params, match }) =>
    publicPageHead({
      name: loaderData?.profilePage.profile.username ?? 'Profile',
      pathname: `/profiles/${encodeURIComponent(params.profileSlug)}`,
      description: "Explore this Dune Zone member's factions, Groups and FAQ contributions.",
      image: loaderData?.profilePage.profile.avatar?.url,
      social: { kind: 'Profile', shape: 'round' },
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
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

type FaqQuestionAsked = ProfilePageData['faqAsked'][number];
type FaqAnswerGiven = ProfilePageData['faqAnswers'][number];

function AskerChip({
  profile,
  viewedProfileId,
}: {
  profile: NonNullable<FaqAnswerGiven['asker_profile']>;
  viewedProfileId: string;
}) {
  if (profile.id === viewedProfileId) {
    return <span className={styles.selfNote}>Your question</span>;
  }

  /* The sentence is the page's and stays unlinked; only the chip navigates. */
  return (
    <span className={styles.askerCitation}>
      Question by{' '}
      <ProfileLink
        slug={profile.slug}
        name={profile.username}
        image={profile.avatar_url}
        className={styles.askerLink}
      />
    </span>
  );
}

/**
 * Lists the questions a person has asked, each under the ruleset it belongs to.
 *
 * The page owns the collection and what to say when it is empty.
 * This owns the rhythm: one row per question, the ruleset-and-date context strip above it, and the link to the question itself.
 */
function FaqQuestionsAsked({ items }: { items: FaqQuestionAsked[] }) {
  return (
    <SectionedSurface>
      {items.map((item) => (
        <SectionedSurface.Row key={item._id}>
          <div className={styles.contextStrip}>
            <RulesetLink slug={item.ruleset.slug} name={item.ruleset.name} image={item.ruleset.coverThumbUrl} />
            <span aria-hidden>·</span>
            <time dateTime={item.created_at}>{formatStableDate(item.created_at)}</time>
          </div>
          <Link
            to="/rulesets/$rulesetSlug/faq/$questionSlug"
            params={{
              rulesetSlug: item.ruleset.slug,
              questionSlug: item.slug,
            }}
          >
            <span className={styles.question}>
              <InlineFormattedTextSource source={item.question} />
            </span>
          </Link>
        </SectionedSurface.Row>
      ))}
    </SectionedSurface>
  );
}

/**
 * Lists the answers a person has given, each under the question it answers.
 *
 * The page owns the collection, the empty case, and which profile is being viewed.
 * That last one decides whether an asker reads as a name or as "Your question".
 * This owns the rhythm and the picked-answer marker.
 */
function FaqAnswersGiven({ items, viewedProfileId }: { items: FaqAnswerGiven[]; viewedProfileId: string }) {
  return (
    <SectionedSurface>
      {items.map((row) => {
        const isPicked = row.faq_item.accepted_answer_id === row._id;

        return (
          <SectionedSurface.Row key={row._id}>
            <div className={styles.contextStrip}>
              <RulesetLink slug={row.ruleset.slug} name={row.ruleset.name} image={row.ruleset.coverThumbUrl} />
              <span aria-hidden>·</span>
              {row.asker_profile ? (
                <AskerChip profile={row.asker_profile} viewedProfileId={viewedProfileId} />
              ) : (
                <span>Unknown asker</span>
              )}
              <span aria-hidden>·</span>
              <time dateTime={row.created_at}>{formatStableDate(row.created_at)}</time>
            </div>

            <p className={styles.parentQuestion}>
              <InlineFormattedTextSource source={row.faq_item.question} />
            </p>

            <Link
              to="/rulesets/$rulesetSlug/faq/$questionSlug"
              params={{
                rulesetSlug: row.ruleset.slug,
                questionSlug: row.faq_item.slug,
              }}
            >
              <FormattedTextSource source={row.answer} className={styles.answerPreview} />
            </Link>

            {isPicked ? (
              <div className={styles.answerFooter}>
                <StatusBadge tone="positive">Picked answer</StatusBadge>
              </div>
            ) : null}
          </SectionedSurface.Row>
        );
      })}
    </SectionedSurface>
  );
}

function ProfileDetailPage() {
  const { profileSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const profileQuery = useProfileBySlug(profileSlug, { initialData: loaderData.profilePage });
  const page = profileQuery.data;
  useLivePageTitle(page?.profile.username ?? undefined);
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

            <Section icon={<MessageCircleReply size={20} aria-hidden />} title="Answers contributed">
              {page.faqAnswers.length > 0 ? (
                <FaqAnswersGiven items={page.faqAnswers} viewedProfileId={page.profile._id} />
              ) : (
                <Surface padding="lg">
                  <Text size="sm" c="dimmed">
                    No FAQ answers yet.
                  </Text>
                </Surface>
              )}
            </Section>

            <Section icon={<CircleHelp size={20} aria-hidden />} title="Questions asked">
              {page.faqAsked.length > 0 ? (
                <FaqQuestionsAsked items={page.faqAsked} />
              ) : (
                <Surface padding="lg">
                  <Text size="sm" c="dimmed">
                    No questions asked yet.
                  </Text>
                </Surface>
              )}
            </Section>
          </Stack>

          <aside className={styles.sidebar} aria-label="Profile details">
            <Stack gap="sm">
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

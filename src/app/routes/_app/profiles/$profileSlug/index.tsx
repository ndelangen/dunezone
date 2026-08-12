import { useAuthActions } from '@convex-dev/auth/react';
import { Group, Stack, Text } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ProposedContent } from '@ui/block/ProposedContent';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { FactionList } from '@ui/list/FactionList';
import { FaqAnswersGiven, FaqQuestionsAsked } from '@ui/list/FaqActivity';
import { Links } from '@ui/list/Links';
import { Stats } from '@ui/list/Stats';
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

import { loadProfileBySlug, useCurrentProfile, useProfileBySlug } from '@db/profiles';

import styles from '../ProfileDetail.module.css';

export const Route = createFileRoute('/_app/profiles/$profileSlug/')({
  loader: async ({ params }) => {
    const profilePage = await loadProfileBySlug(params.profileSlug);
    return { profilePage };
  },
  component: ProfileDetailPage,
});

function ProfileDetailPage() {
  const { profileSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const profileQuery = useProfileBySlug(profileSlug, { initialData: loaderData.profilePage });
  const page = profileQuery.data;
  const currentProfile = useCurrentProfile();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  if (!page) {
    return (
      <PageLayout header={<h1>Profile</h1>}>
        <Surface padding="lg">
          <p>Profile not found.</p>
          <p>
            <Link to="/profiles">Back to profiles</Link>
          </p>
        </Surface>
      </PageLayout>
    );
  }

  const isSelf = currentProfile.data?._id === page.profile._id;
  const initials =
    page.profile.username
      ?.slice(0, 2)
      .toUpperCase()
      .replace(/[^A-Z]/g, '') || '?';

  const handleSignOut = async () => {
    await signOut();
    await navigate({ to: '/auth/login' });
  };

  const acceptedAnswerCount = page.acceptedAnswerCount;

  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <Group gap="xs" wrap="nowrap">
          <IconAction
            label="Back to profiles"
            variant="light"
            color="gray"
            size="lg"
            renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
            icon={<ArrowLeft size={16} aria-hidden />}
          />
          {isSelf ? (
            <IconAction
              label="Edit profile"
              variant="light"
              color="dune"
              size="lg"
              renderRoot={(rootProps) => (
                <Link {...rootProps} to="/profiles/$profileSlug/edit" params={{ profileSlug }} />
              )}
              icon={<Pencil size={16} aria-hidden />}
            />
          ) : null}
          {isSelf ? (
            <IconAction
              label="Start group"
              variant="filled"
              color="confirm"
              size="lg"
              renderRoot={(rootProps) => <Link {...rootProps} to="/groups/create" />}
              icon={<UserPlus size={16} aria-hidden />}
            />
          ) : null}
        </Group>
      </Toolbar.Left>
      {isSelf ? (
        <Toolbar.Right>
          <IconAction
            label="Log out"
            variant="light"
            color="red"
            size="lg"
            onClick={() => void handleSignOut()}
            icon={<LogOut size={16} aria-hidden />}
          />
        </Toolbar.Right>
      ) : null}
    </Toolbar>
  );

  return (
    <PageLayout
      header={
        <div className={styles.identityRow}>
          {page.profile.avatar_url ? (
            <img
              src={page.profile.avatar_url}
              alt={page.profile.username ?? 'Avatar'}
              className={styles.avatar}
            />
          ) : (
            <span className={styles.avatarPlaceholder}>{initials}</span>
          )}
          <Stack gap="xs">
            <h1 className={styles.displayName}>{page.profile.username ?? 'Unknown'}</h1>
            {isSelf && <p className={styles.selfHint}>This is you!</p>}
            <p className={styles.profileSummary}>
              <strong>Proposed bio:</strong> A short introduction describing this contributor's
              interests and work.
            </p>
          </Stack>
        </div>
      }
      headerSize="compact"
      toolbar={toolbar}
    >
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
            <Card icon={<UsersRound size={20} aria-hidden />} title="At a glance">
              <Stats
                orientation="column"
                items={[
                  {
                    key: 'factions',
                    icon: <Shield size={18} aria-hidden />,
                    value: page.factions.length,
                    name: 'Factions',
                    label: `${page.factions.length} factions`,
                  },
                  {
                    key: 'groups',
                    icon: <UsersRound size={18} aria-hidden />,
                    value: page.groupSummaries.length,
                    name: 'Groups',
                    label: `${page.groupSummaries.length} groups`,
                  },
                  {
                    key: 'answers',
                    icon: <MessageCircleReply size={18} aria-hidden />,
                    value: page.faqAnswers.length,
                    name: 'Answers',
                    label: `${page.faqAnswers.length} answers`,
                  },
                  {
                    key: 'picked',
                    icon: <CheckCircle2 size={18} aria-hidden />,
                    value: acceptedAnswerCount,
                    name: 'Picked answers',
                    label: `${acceptedAnswerCount} picked answers`,
                  },
                  {
                    key: 'questions',
                    icon: <CircleHelp size={18} aria-hidden />,
                    value: page.faqAsked.length,
                    name: 'Questions',
                    label: `${page.faqAsked.length} questions`,
                  },
                ]}
              />
            </Card>

            <Card icon={<Link2 size={20} aria-hidden />} title="About">
              <Stack gap="xs">
                <ProposedContent label="Proposed profile fields">
                  <Text size="sm" c="dimmed">
                    A short bio and a small set of relevant external links could live here.
                  </Text>
                </ProposedContent>
                <p className={styles.memberSince}>
                  Member since{' '}
                  <time dateTime={page.profile.created_at}>
                    {new Intl.DateTimeFormat('en', {
                      month: 'short',
                      year: 'numeric',
                    }).format(new Date(page.profile.created_at))}
                  </time>
                </p>
              </Stack>
            </Card>

            <Card icon={<UsersRound size={20} aria-hidden />} title="Groups">
              {page.groupSummaries.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Not a member of any groups.
                </Text>
              ) : (
                <Links>
                  {page.groupSummaries.map((group) => (
                    <Links.Item
                      key={group.id}
                      to="/groups/$groupSlug"
                      params={{ groupSlug: group.slug }}
                    >
                      {group.name}
                    </Links.Item>
                  ))}
                </Links>
              )}
            </Card>
          </Stack>
        </aside>
      </div>
    </PageLayout>
  );
}

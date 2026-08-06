import { useAuthActions } from '@convex-dev/auth/react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
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
import { FactionList } from '@app/components/factions/FactionList';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { ButtonGroup, Stack, Toolbar } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
import {
  ProfileFaqAnswersGiven,
  ProfileFaqQuestionsAsked,
} from '@app/components/profile/ProfileFaqActivity';
import { PageLayout } from '@app/components/shell';
import { TopicIcon } from '@app/components/topics/TopicIcon';

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
  const profileData = useProfileBySlug(profileSlug, { initialData: loaderData.profilePage });
  const currentProfile = useCurrentProfile();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  if (!profileData.profile) {
    return (
      <PageLayout header={<h1>Profile</h1>}>
        <Card>
          <p>Profile not found.</p>
          <p>
            <Link to="/profiles">Back to profiles</Link>
          </p>
        </Card>
      </PageLayout>
    );
  }

  const isSelf = currentProfile.data?._id === profileData.profile._id;
  const initials =
    profileData.profile.username
      ?.slice(0, 2)
      .toUpperCase()
      .replace(/[^A-Z]/g, '') || '?';

  const handleSignOut = async () => {
    await signOut();
    await navigate({ to: '/auth/login' });
  };

  const groupsById = profileData.groupsById ?? new Map();
  const acceptedAnswerCount = profileData.acceptedAnswerCount ?? 0;

  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <ButtonGroup>
          <FormTooltip content="Back to profiles">
            <UIButton variant="nav" to="/profiles" aria-label="Back to profiles">
              <ArrowLeft size={16} aria-hidden />
            </UIButton>
          </FormTooltip>
          {isSelf ? (
            <FormTooltip content="Edit profile">
              <UIButton
                variant="secondary"
                to="/profiles/$profileSlug/edit"
                params={{ profileSlug }}
                aria-label="Edit profile"
              >
                <Pencil size={16} aria-hidden />
              </UIButton>
            </FormTooltip>
          ) : null}
          {isSelf ? (
            <FormTooltip content="Start group">
              <UIButton variant="confirm" to="/groups/create" aria-label="Start group">
                <UserPlus size={16} aria-hidden />
              </UIButton>
            </FormTooltip>
          ) : null}
        </ButtonGroup>
      </Toolbar.Left>
      {isSelf ? (
        <Toolbar.Right>
          <FormTooltip content="Log out">
            <UIButton
              type="button"
              variant="critical"
              iconOnly
              aria-label="Log out"
              onClick={() => void handleSignOut()}
            >
              <LogOut size={16} aria-hidden />
            </UIButton>
          </FormTooltip>
        </Toolbar.Right>
      ) : null}
    </Toolbar>
  );

  return (
    <PageLayout
      header={
        <div className={styles.identityRow}>
          {profileData.profile.avatar_url ? (
            <img
              src={profileData.profile.avatar_url}
              alt={profileData.profile.username ?? 'Avatar'}
              className={styles.avatar}
            />
          ) : (
            <span className={styles.avatarPlaceholder}>{initials}</span>
          )}
          <Stack gap={1}>
            <h1 className={styles.displayName}>{profileData.profile.username ?? 'Unknown'}</h1>
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
        <Stack gap={4} className={styles.mainColumn}>
          <section className={styles.section}>
            <h2 className={styles.iconHeading}>
              <Shield size={20} aria-hidden /> Factions created
            </h2>
            {profileData.factions && profileData.factions.length > 0 ? (
              <FactionList factions={profileData.factions} />
            ) : (
              <Card>
                <p className={styles.empty}>No factions created yet.</p>
              </Card>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.iconHeading}>
              <TopicIcon topic="rulesets" size={20} /> Rulesets maintained
            </h2>
            <Card>
              <Stack gap={2}>
                <p className={styles.proposedLabel}>Proposed content · page query required</p>
                <p className={styles.empty}>
                  Rulesets owned or maintained by this contributor would appear here.
                </p>
              </Stack>
            </Card>
          </section>

          <section className={styles.section}>
            <h2 className={styles.iconHeading}>
              <MessageCircleReply size={20} aria-hidden /> Answers contributed
            </h2>
            <Card>
              {profileData.faqAnswers && profileData.faqAnswers.length > 0 ? (
                <ProfileFaqAnswersGiven
                  items={profileData.faqAnswers}
                  viewedProfileId={profileData.profile._id}
                />
              ) : (
                <p className={styles.empty}>No FAQ answers yet.</p>
              )}
            </Card>
          </section>

          <section className={styles.section}>
            <h2 className={styles.iconHeading}>
              <CircleHelp size={20} aria-hidden /> Questions asked
            </h2>
            <Card>
              {profileData.faqAsked && profileData.faqAsked.length > 0 ? (
                <ProfileFaqQuestionsAsked items={profileData.faqAsked} />
              ) : (
                <p className={styles.empty}>No questions asked yet.</p>
              )}
            </Card>
          </section>
        </Stack>

        <aside className={styles.sidebar} aria-label="Profile details">
          <Stack gap={3}>
            <Card
              header={
                <h2 className={styles.iconHeading}>
                  <UsersRound size={20} aria-hidden /> At a glance
                </h2>
              }
            >
              <div className={styles.factList}>
                <p>
                  <Shield size={18} aria-hidden />
                  <strong>{profileData.factions?.length ?? 0}</strong>
                  <span>Factions</span>
                </p>
                <p>
                  <UsersRound size={18} aria-hidden />
                  <strong>{profileData.memberships?.length ?? 0}</strong>
                  <span>Groups</span>
                </p>
                <p>
                  <MessageCircleReply size={18} aria-hidden />
                  <strong>{profileData.faqAnswers?.length ?? 0}</strong>
                  <span>Answers</span>
                </p>
                <p>
                  <CheckCircle2 size={18} aria-hidden />
                  <strong>{acceptedAnswerCount}</strong>
                  <span>Picked answers</span>
                </p>
                <p>
                  <CircleHelp size={18} aria-hidden />
                  <strong>{profileData.faqAsked?.length ?? 0}</strong>
                  <span>Questions</span>
                </p>
              </div>
            </Card>

            <Card
              header={
                <h2 className={styles.iconHeading}>
                  <Link2 size={20} aria-hidden /> About
                </h2>
              }
            >
              <Stack gap={2}>
                <p className={styles.proposedLabel}>Proposed profile fields</p>
                <p className={styles.empty}>
                  A short bio and a small set of relevant external links could live here.
                </p>
                <p className={styles.memberSince}>
                  Member since{' '}
                  <time dateTime={profileData.profile.created_at}>
                    {new Intl.DateTimeFormat('en', {
                      month: 'short',
                      year: 'numeric',
                    }).format(new Date(profileData.profile.created_at))}
                  </time>
                </p>
              </Stack>
            </Card>

            <Card
              header={
                <h2 className={styles.iconHeading}>
                  <UsersRound size={20} aria-hidden /> Groups
                </h2>
              }
            >
              {profileData.memberships && profileData.memberships.length > 0 ? (
                <ul className={styles.list}>
                  {profileData.memberships.map((m) => {
                    const group = groupsById.get(String(m.group_id));
                    return (
                      <li key={m._id}>
                        {group?.slug ? (
                          <Link to="/groups/$groupSlug" params={{ groupSlug: group.slug }}>
                            {group.name}
                          </Link>
                        ) : group ? (
                          <span>{group.name}</span>
                        ) : (
                          <span title={m.group_id}>Unknown group</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.empty}>Not a member of any groups.</p>
              )}
            </Card>
          </Stack>
        </aside>
      </div>
    </PageLayout>
  );
}

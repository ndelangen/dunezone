import { createFileRoute } from '@tanstack/react-router';
import { CircleHelp, MessageCircleReply, Shield, UsersRound } from 'lucide-react';

import { loadProfilesAll, useProfilesAll } from '@db/profiles';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { ButtonGroup, Stack, Toolbar } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { PageLayout } from '@app/components/shell';

import styles from './ProfilesIndex.module.css';

const EMPTY_ACTIVITY = {
  groupCount: 0,
  factionCount: 0,
  questionCount: 0,
  answerCount: 0,
};

export const Route = createFileRoute('/_app/profiles/')({
  loader: async () => ({ profiles: await loadProfilesAll() }),
  component: ProfilesPage,
});

function ProfilesPage() {
  const loaderData = Route.useLoaderData();
  const profiles = useProfilesAll({ initialData: loaderData.profiles });

  return (
    <PageLayout>
      {profiles.data && profiles.data.length > 0 ? (
        <Card>
          <Stack as="ul" gap={2} className={styles.list}>
            {profiles.data.map((profile) => {
              const activity = profile.activity ?? EMPTY_ACTIVITY;
              return (
                <li key={profile._id}>
                  <Toolbar>
                    <Toolbar.Left>
                      <ProfileLink
                        slug={profile.slug}
                        username={profile.username}
                        avatar_url={profile.avatar_url}
                      />
                    </Toolbar.Left>
                    <Toolbar.Right>
                      <FormTooltip content={`Groups: ${activity.groupCount}`}>
                        <div role="img" aria-label={`Groups: ${activity.groupCount}`}>
                          <ButtonGroup>
                            <UsersRound size={16} aria-hidden />
                            <strong>{activity.groupCount}</strong>
                          </ButtonGroup>
                        </div>
                      </FormTooltip>
                      <FormTooltip content={`Factions owned: ${activity.factionCount}`}>
                        <div role="img" aria-label={`Factions owned: ${activity.factionCount}`}>
                          <ButtonGroup>
                            <Shield size={16} aria-hidden />
                            <strong>{activity.factionCount}</strong>
                          </ButtonGroup>
                        </div>
                      </FormTooltip>
                      <FormTooltip content={`Questions asked: ${activity.questionCount}`}>
                        <div role="img" aria-label={`Questions asked: ${activity.questionCount}`}>
                          <ButtonGroup>
                            <CircleHelp size={16} aria-hidden />
                            <strong>{activity.questionCount}</strong>
                          </ButtonGroup>
                        </div>
                      </FormTooltip>
                      <FormTooltip content={`Answers given: ${activity.answerCount}`}>
                        <div role="img" aria-label={`Answers given: ${activity.answerCount}`}>
                          <ButtonGroup>
                            <MessageCircleReply size={16} aria-hidden />
                            <strong>{activity.answerCount}</strong>
                          </ButtonGroup>
                        </div>
                      </FormTooltip>
                    </Toolbar.Right>
                  </Toolbar>
                </li>
              );
            })}
          </Stack>
        </Card>
      ) : (
        <p className={styles.empty}>No profiles yet.</p>
      )}
    </PageLayout>
  );
}

import { Group, Stack, Text } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { ProfileLink } from '@ui/content/ProfileLink';
import { PageLayout } from '@ui/layout/PageLayout';
import { Stats } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { CircleHelp, MessageCircleReply, Shield, UsersRound } from 'lucide-react';

import { loadProfilesAll, useProfilesAll } from '@db/profiles';

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
      <PageLayout.Header>
        <h1>Profiles</h1>
      </PageLayout.Header>
      <PageLayout.Content>
        {profiles.data && profiles.data.length > 0 ? (
          <Surface padding="lg">
            <Stack component="ul" gap="xs" className={styles.list}>
              {profiles.data.map((profile) => {
                const activity = profile.activity ?? EMPTY_ACTIVITY;
                return (
                  <li key={profile._id}>
                    <Group justify="space-between" wrap="nowrap" gap="md">
                      <ProfileLink
                        slug={profile.slug}
                        username={profile.username}
                        avatar_url={profile.avatar_url}
                      />

                      <Stats
                        items={[
                          {
                            key: 'groups',
                            icon: <UsersRound size={16} aria-hidden />,
                            value: activity.groupCount,
                            label: `Groups: ${activity.groupCount}`,
                          },
                          {
                            key: 'factions',
                            icon: <Shield size={16} aria-hidden />,
                            value: activity.factionCount,
                            label: `Factions owned: ${activity.factionCount}`,
                          },
                          {
                            key: 'questions',
                            icon: <CircleHelp size={16} aria-hidden />,
                            value: activity.questionCount,
                            label: `Questions asked: ${activity.questionCount}`,
                          },
                          {
                            key: 'answers',
                            icon: <MessageCircleReply size={16} aria-hidden />,
                            value: activity.answerCount,
                            label: `Answers given: ${activity.answerCount}`,
                          },
                        ]}
                      />
                    </Group>
                  </li>
                );
              })}
            </Stack>
          </Surface>
        ) : (
          <Text size="sm" c="dimmed">
            No profiles yet.
          </Text>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}

import { Anchor, Stack, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

import { useCreatableRulesets } from '@db/play';

export const Route = createFileRoute('/_app/play/')({
  head: () => ({ meta: [{ title: 'Game lobby | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: PlayLobby,
});

function PlayLobby() {
  const { data } = useCreatableRulesets();
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title="Game lobby" />
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          <Stack gap="xs">
            <Text>Ongoing and past games will appear here.</Text>
            <Text c="dimmed">The game lobby is not available yet.</Text>
            {data?.access === 'admin' ? (
              <Anchor component={Link} to="/play/create">
                Create a game
              </Anchor>
            ) : null}
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

import { Stack, Text } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

export const Route = createFileRoute('/_app/play/')({
  head: () => ({ meta: [{ title: 'Game lobby | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: PlayLobby,
});

function PlayLobby() {
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
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

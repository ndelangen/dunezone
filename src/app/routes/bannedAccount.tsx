import { MantineProvider, Text } from '@mantine/core';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { appContentTheme } from '@ui/theme';

import '../styles/mantine.generated.css';

/** Loaded only for a banned session, so public print routes keep their own styling. */
export default function BannedAccount() {
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="dark">
      <Surface padding="xl">
        <PageLayout>
          <PageLayout.Header size="inline">
            <PageTitle title="You have been banned" />
          </PageLayout.Header>
          <PageLayout.Content>
            <Text>This account cannot access Dune Zone.</Text>
          </PageLayout.Content>
        </PageLayout>
      </Surface>
    </MantineProvider>
  );
}

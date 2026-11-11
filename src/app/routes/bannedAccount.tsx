import { useAuthActions } from '@convex-dev/auth/react';
import { MantineProvider, Text } from '@mantine/core';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { appContentTheme } from '@ui/theme';
import { useEffect, useRef } from 'react';

import { forgetStoredPlayTables } from '@db/playTables';

import '../styles/mantine.generated.css';

/** Loaded only for a banned session, so public print routes keep their own styling. */
export default function BannedAccount() {
  const { signOut } = useAuthActions();
  const signingOut = useRef(false);
  useEffect(() => {
    if (signingOut.current) {
      return;
    }
    signingOut.current = true;
    forgetStoredPlayTables();
    void signOut().catch(() => {
      signingOut.current = false;
    });
  }, [signOut]);
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

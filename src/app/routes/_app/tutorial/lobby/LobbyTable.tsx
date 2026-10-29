import type { ReactNode } from 'react';

import type { LobbyState } from '../chapterScripts/chapterScript';
import { PracticeTable, useTutorialTable } from '../practiceTable';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { openedIdentity, openedTable } from './openedTable';

export default function LobbyTable({
  setup,
  opened,
  page,
  exit,
  onReady,
}: Readonly<{
  setup: TutorialSetup;
  opened: NonNullable<LobbyState['opened']>;
  page: string;
  exit: ReactNode;
  onReady: () => void;
}>) {
  const { runtime } = useTutorialTable(setup, () => openedTable(setup, opened, window.location.origin));
  const identity = openedIdentity(opened);
  return (
    <PracticeTable
      runtime={runtime}
      title={identity.name}
      identity={{ ...identity, page }}
      exit={exit}
      onReady={onReady}
    />
  );
}

import { Anchor, Stack, Text } from '@mantine/core';
import type { playLobbyEntrySchema } from '@shared/play/directory';
import { phaseAt, tableProgressFor } from '@shared/play/phases';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { PageLayout } from '@ui/layout/PageLayout';
import { Links } from '@ui/list/Links';
import { Surface } from '@ui/surface';
import type { z } from 'zod';

import { useLobbyGames } from '@db/play';

/*
 * The lobby lists what the directory holds and nothing more; it never loads the 3D runtime.
 * Real games are Administrator-only while that gate stands, so everyone else reads an empty lobby.
 */
export const Route = createFileRoute('/_app/play/')({
  head: () => ({ meta: [{ title: 'Game lobby | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: PlayLobby,
});

type LobbyEntry = z.infer<typeof playLobbyEntrySchema>;

const STAGE_WORDS: Record<LobbyEntry['stage'], string> = {
  drafting: 'Drafting',
  swapping: 'Swapping',
  setup: 'Setup',
  play: 'In play',
  finished: 'Finished',
  discarded: 'Discarded',
};

/** One line per game: what it plays, where it is, who sits, and whether the viewer is among them. */
function entryLine(entry: LobbyEntry): string {
  const where =
    entry.stage === 'play' && entry.phase !== null
      ? `Turn ${tableProgressFor(entry.phase).turn}, ${phaseAt(entry.phase).label}`
      : STAGE_WORDS[entry.stage];
  const seats = `${entry.seatsFilled} of ${entry.seatCount} seats`;
  return [entry.name, where, seats, resultWords(entry.result), entry.viewerSeated ? 'you hold a seat' : null]
    .filter((part) => part !== null)
    .join(' · ');
}

function resultWords(result: LobbyEntry['result']): string | null {
  switch (result?.kind) {
    case undefined:
      return null;
    case 'none':
      return 'no winner';
    case 'faction':
      return `winner ${result.factions.join(', ')}`;
    case 'alliance':
      return `alliance ${result.factions.join(', ')}`;
  }
}

function GameList({ entries, empty }: Readonly<{ entries: LobbyEntry[]; empty: string }>) {
  if (entries.length === 0) {
    return <Text c="dimmed">{empty}</Text>;
  }
  return (
    <Links>
      {entries.map((entry) => (
        <Links.Item key={entry.gameId} to="/play/$gameId" params={{ gameId: entry.gameId }}>
          {entryLine(entry)}
        </Links.Item>
      ))}
    </Links>
  );
}

function PlayLobby() {
  const { data: lobby } = useLobbyGames();
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title="Game lobby" />
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          <Stack gap="lg">
            {lobby?.status === 'ready' ? (
              <>
                <Section title="Ongoing" description="Games that are drafting, swapping, setting up or in play.">
                  <GameList entries={lobby.ongoing} empty="No game is under way." />
                </Section>
                <Section title="Past" description="Finished games with their declared result.">
                  <GameList entries={lobby.past} empty="No game has finished yet." />
                </Section>
              </>
            ) : (
              <Text c="dimmed">
                {lobby === undefined ? 'Loading games.' : 'Ongoing and past games appear here once you may enter them.'}
              </Text>
            )}
            {lobby?.status === 'ready' && lobby.canCreate ? (
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

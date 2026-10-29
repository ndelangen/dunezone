import { Box, Button, Paper, Stack, Text, Title } from '@mantine/core';
import { waitForFrame } from '@sb/storyWaits';
import { useRef } from 'react';
import { userEvent, within } from 'storybook/test';

import type { Faction } from '@db/factions';

import { defaultFaction } from './defaultFaction';
import { FactionSheetReview } from './FactionSheetReview';
import type { FactionSheetReviewHandle } from './FactionSheetReview';

function EditorChapter({ index }: { index: number }) {
  return (
    <Paper withBorder radius="lg" p="xl" mih={index === 1 ? 340 : 240}>
      <Text size="xs" fw={800} tt="uppercase" c="dune.8">
        Chapter {String(index).padStart(2, '0')}
      </Text>
      <Title order={2}>
        {['Identity & Appearance', 'Leaders', 'Alliance', 'Planets & Troops', 'Rules & Advantages'][index - 1]}
      </Title>
      <Text c="dimmed" mt="sm">
        Representative editor content preserves this plane&apos;s width and height while review is open.
      </Text>
    </Paper>
  );
}

const longContentLabels = Array.from({ length: 8 }, (_, index) => `Long authored collection ${index + 1}`);

export function ReviewFixture({ faction, longContent = false }: { faction: Faction; longContent?: boolean }) {
  const reviewRef = useRef<FactionSheetReviewHandle>(null);
  return (
    <Box w="min(78rem, calc(100vw - 2rem))" p="md">
      <Button visibleFrom="sm" mb="md" onClick={(event) => reviewRef.current?.open(event.currentTarget)}>
        Review faction sheet
      </Button>
      <FactionSheetReview ref={reviewRef} faction={faction}>
        <Stack gap="xl">
          {[1, 2, 3, 4, 5].map((index) => (
            <EditorChapter key={index} index={index} />
          ))}
          {longContent
            ? longContentLabels.map((label) => (
                <Paper key={label} withBorder radius="lg" p="xl" mih={260}>
                  <Title order={3}>{label}</Title>
                  <Text c="dimmed">Extra content proves the review plane remains bounded by the editor document.</Text>
                </Paper>
              ))
            : null}
        </Stack>
      </FactionSheetReview>
    </Box>
  );
}

export async function openReview(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(page.getByRole('button', { name: 'Review faction sheet' }));
  /* The review plane opens from inside a second animation-frame callback, so each poll runs the waiting frames itself. */
  await waitForFrame(() => page.getByRole('heading', { name: 'Review faction artifacts' }));
}

export const storyFaction = structuredClone(defaultFaction);

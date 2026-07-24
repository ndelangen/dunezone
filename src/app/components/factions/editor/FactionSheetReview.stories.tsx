import { Box, Paper, Stack, Text, Title } from '@mantine/core';
import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import type { Faction } from '@db/factions';
import { defaultFaction } from '@data/defaultFaction';

import { FactionSheetReview } from './FactionSheetReview';

function EditorChapter({ index }: { index: number }) {
  return (
    <Paper withBorder radius="lg" p="xl" mih={index === 1 ? 340 : 240}>
      <Text size="xs" fw={800} tt="uppercase" c="dune.8">
        Chapter {String(index).padStart(2, '0')}
      </Text>
      <Title order={2}>
        {
          ['Identity & Appearance', 'Leaders', 'Alliance', 'Forces & Worlds', 'Rules & Advantages'][
            index - 1
          ]
        }
      </Title>
      <Text c="dimmed" mt="sm">
        Representative editor content preserves this plane&apos;s width and height while review is
        open.
      </Text>
    </Paper>
  );
}

const longContentLabels = Array.from(
  { length: 8 },
  (_, index) => `Long authored collection ${index + 1}`
);

function ReviewFixture({
  faction,
  longContent = false,
}: {
  faction: Faction;
  longContent?: boolean;
}) {
  return (
    <Box w="min(78rem, calc(100vw - 2rem))" p="md">
      <FactionSheetReview faction={faction}>
        <Stack gap="xl">
          {[1, 2, 3, 4, 5].map((index) => (
            <EditorChapter key={index} index={index} />
          ))}
          {longContent
            ? longContentLabels.map((label) => (
                <Paper key={label} withBorder radius="lg" p="xl" mih={260}>
                  <Title order={3}>{label}</Title>
                  <Text c="dimmed">
                    Extra content proves the review plane remains bounded by the editor document.
                  </Text>
                </Paper>
              ))
            : null}
        </Stack>
      </FactionSheetReview>
    </Box>
  );
}

const meta = preview.meta({
  title: 'App/Factions/Editor/FactionSheetReview',
  component: ReviewFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

async function openReview(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(page.getByRole('button', { name: 'Review faction sheet' }));
  await page.findByRole('button', { name: 'Close faction sheet review' });
  await expect(page.getByTestId('faction-review-story-root')).toBeInTheDocument();
}

const storyFaction = structuredClone(defaultFaction);

export const DesktopHorizontal = meta.story({
  args: {
    faction: storyFaction,
  },
  globals: {
    viewport: {
      value: 'appLarge',
    },
  },
  render: (args) => (
    <div data-testid="faction-review-story-root">
      <ReviewFixture {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => openReview(canvasElement),
});

export const ConstrainedStacked = meta.story({
  args: {
    faction: storyFaction,
  },
  globals: {
    viewport: {
      value: 'appConstrained',
    },
  },
  render: (args) => (
    <div data-testid="faction-review-story-root">
      <ReviewFixture {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => openReview(canvasElement),
});

export const ReducedMotion = meta.story({
  args: {
    faction: storyFaction,
  },
  render: (args) => (
    <div data-testid="faction-review-story-root">
      <ReviewFixture {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => openReview(canvasElement),
});

export const LongContent = meta.story({
  args: {
    faction: storyFaction,
    longContent: true,
  },
  render: (args) => (
    <div data-testid="faction-review-story-root">
      <ReviewFixture {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => openReview(canvasElement),
});

export const EditorStripFocus = meta.story({
  args: {
    faction: storyFaction,
  },
  render: (args) => (
    <div data-testid="faction-review-story-root">
      <ReviewFixture {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await openReview(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const strip = page.getByRole('button', {
      name: 'Close sheet review and return to editing',
    });
    strip.focus();
    await expect(strip).toHaveFocus();
  },
});

export const PreviewFreeMobile = meta.story({
  args: {
    faction: storyFaction,
  },
  globals: {
    viewport: {
      value: 'appMobile',
    },
  },
  render: (args) => (
    <div data-testid="faction-review-story-root">
      <ReviewFixture {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.queryByRole('button', { name: 'Review faction sheet' })
    ).not.toBeInTheDocument();
    await expect(page.queryByLabelText('Faction sheet page 1')).not.toBeInTheDocument();
  },
});

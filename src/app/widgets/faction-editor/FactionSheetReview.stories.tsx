import { Box, Button, Paper, Stack, Text, Title } from '@mantine/core';
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { useRef } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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

function ReviewFixture({ faction, longContent = false }: { faction: Faction; longContent?: boolean }) {
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

const meta = preview.meta({
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
  /* The review plane opens from inside a second animation-frame callback, so each poll runs the waiting frames itself. */
  await waitForFrame(() => page.getByRole('heading', { name: 'Review faction artifacts' }));
}

/* Both sheet-page tiles of an open review, by the titles their preview frames carry. */
function sheetPageBounds(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  return [1, 2].map((pageNumber) => page.getByTitle(`Faction sheet page ${pageNumber}`).getBoundingClientRect());
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
  /* The two pages sit side by side. */
  play: async ({ canvasElement }) => {
    await openReview(canvasElement);
    const [first, second] = sheetPageBounds(canvasElement);
    await expect(Math.abs(first!.top - second!.top)).toBeLessThan(2);
    await expect(second!.left).toBeGreaterThanOrEqual(first!.right - 1);
  },
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
  /* The second page stacks under the first. */
  play: async ({ canvasElement }) => {
    await openReview(canvasElement);
    const [first, second] = sheetPageBounds(canvasElement);
    await expect(Math.abs(first!.left - second!.left)).toBeLessThan(2);
    await expect(second!.top).toBeGreaterThanOrEqual(first!.bottom - 1);
  },
});

/**
 * A faction with no karama rules, no troops and no leaders has no second sheet page.
 * The review offers one tile rather than a second one showing the first page again under a page-2 label.
 */
const singlePageFaction: Faction = {
  ...storyFaction,
  leaders: [],
  troops: [],
  rules: { ...storyFaction.rules, advantages: [] },
};

export const WithoutASecondPage = meta.story({
  args: {
    faction: singlePageFaction,
  },
  globals: {
    viewport: {
      value: 'appLarge',
    },
  },
  play: async ({ canvasElement }) => {
    await openReview(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTitle('Faction sheet page 1')).toBeInTheDocument();
    await expect(page.queryByTitle('Faction sheet page 2')).toBeNull();
    await expect(page.queryByText('Scroll for page 2')).toBeNull();
  },
});

/** Resolves after the next frame's resize observers have run, so a check that nothing moved is not made before they could move it. */
async function afterResizeObservers(view: Window) {
  await new Promise<void>((resolve) => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())));
}

/**
 * A stage that narrows below the review's width closes an open review the way its close button does, so focus goes back to the button that opened it instead of dropping to the page body when the panel goes inert.
 * Once the review is closed, a stage resize leaves focus where it is.
 */
export const NarrowingStageClosesReview = meta.story({
  args: {
    faction: storyFaction,
  },
  globals: {
    viewport: {
      value: 'appLarge',
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const view = canvasElement.ownerDocument.defaultView;
    const stage = canvasElement.querySelector<HTMLElement>('[data-faction-sheet-review]');
    const stageHost = stage?.parentElement;
    if (!view || !stage || !stageHost) {
      throw new Error('The review stage never rendered, so it cannot be narrowed.');
    }
    const trigger = page.getByRole('button', { name: 'Review faction sheet' });

    await openReview(canvasElement);
    await waitFor(() => expect(page.getByRole('button', { name: 'Close faction sheet review' })).toHaveFocus());

    stageHost.style.width = '30rem';
    await waitFor(() => expect(stage).not.toHaveAttribute('data-review-open'));
    await expect(trigger).toHaveFocus();

    trigger.blur();
    stageHost.style.width = '78rem';
    await afterResizeObservers(view);
    stageHost.style.width = '30rem';
    await afterResizeObservers(view);
    await expect(trigger).not.toHaveFocus();
  },
});

export const LongContent = meta.story({
  args: {
    faction: storyFaction,
    longContent: true,
  },
  /* However long the editor runs, the review panel stays inside the editor document rather than hanging past its end. */
  play: async ({ canvasElement }) => {
    await openReview(canvasElement);
    const stage = canvasElement.querySelector('[data-faction-sheet-review]');
    const panel = within(canvasElement.ownerDocument.body).getByRole('complementary');
    await waitForFrame(() =>
      expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual((stage?.getBoundingClientRect().bottom ?? 0) + 1)
    );
  },
});

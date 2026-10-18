import { Center, Text } from '@mantine/core';
import { expect, within } from 'storybook/test';

type LayoutSlotPlaceholderTone = 'header' | 'primary' | 'secondary' | 'tertiary' | 'toolbar';

const toneColors: Record<LayoutSlotPlaceholderTone, string> = {
  header: 'blue',
  toolbar: 'violet',
  primary: 'teal',
  secondary: 'orange',
  tertiary: 'pink',
};

export function LayoutSlotPlaceholder({
  name,
  tone,
  minHeight = 240,
}: Readonly<{
  name: string;
  tone: LayoutSlotPlaceholderTone;
  minHeight?: number;
}>) {
  const color = toneColors[tone];

  return (
    <Center
      bg={`${color}.1`}
      c={`${color}.9`}
      h="100%"
      mih={minHeight}
      p="md"
      w="100%"
      style={{
        border: `1px solid var(--mantine-color-${color}-3)`,
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <Text ta="center" fw={700} size="sm">
        {name}
      </Text>
    </Center>
  );
}

/** The box of the placeholder named `name`, for a play that checks where a layout put it. */
export function slotRect(canvasElement: HTMLElement, name: string) {
  return within(canvasElement).getByText(name).parentElement!.getBoundingClientRect();
}

/** The slots named `names`, in order, each start below the one before it ends, on one shared left edge. */
export async function expectStackedSlots(canvasElement: HTMLElement, names: readonly string[]) {
  const rects = names.map((name) => slotRect(canvasElement, name));
  for (const [index, rect] of rects.entries()) {
    await expect(rect.left).toBeCloseTo(rects[0]!.left, 0);
    if (index > 0) {
      await expect(rect.top).toBeGreaterThanOrEqual(rects[index - 1]!.bottom);
    }
  }
}

/** The slots named `names`, in order, sit side by side from left to right on one shared top edge. */
export async function expectSideBySideSlots(canvasElement: HTMLElement, names: readonly string[]) {
  const rects = names.map((name) => slotRect(canvasElement, name));
  for (const [index, rect] of rects.entries()) {
    await expect(rect.top).toBeCloseTo(rects[0]!.top, 0);
    if (index > 0) {
      await expect(rect.left).toBeGreaterThanOrEqual(rects[index - 1]!.right);
    }
  }
}

/**
 * The column holding the stress case's unbroken word and oversized image keeps the track it was given, ending before the next column starts.
 * Only the track is asserted, because the word and the image themselves still paint past that edge.
 */
export async function expectStressColumnKeepsItsTrack(canvasElement: HTMLElement) {
  const column = within(canvasElement).getByText(/^DuneZoneLayoutStressCase/).parentElement!.parentElement!;
  const next = column.nextElementSibling!.getBoundingClientRect();
  await expect(column.getBoundingClientRect().right).toBeLessThanOrEqual(next.left);
}

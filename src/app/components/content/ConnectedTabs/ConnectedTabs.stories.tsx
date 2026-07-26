import { Box, Button, Title } from '@mantine/core';
import preview from '@sb/preview';
import { BookOpen, CircleUserRound, Settings } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { ConnectedTabs } from './ConnectedTabs';

type ExampleTab = 'overview' | 'people' | 'settings';

const items = [
  {
    value: 'overview',
    label: 'Overview',
    icon: <BookOpen size={20} />,
    panel: <Panel title="Overview">A short representative content panel.</Panel>,
  },
  {
    value: 'people',
    label: 'People',
    icon: <CircleUserRound size={20} />,
    panel: (
      <Panel title="People">
        This taller middle state proves the joined contour responds to content changes.
        <Box h={240} />
      </Panel>
    ),
  },
  {
    value: 'settings',
    label: 'Settings',
    icon: <Settings size={20} />,
    panel: <Panel title="Settings">The final tab joins the panel at its lower edge.</Panel>,
  },
] as const;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Title order={2}>{title}</Title>
      <Box mt="sm">{children}</Box>
      <Box mt="xl" h={180} />
    </Box>
  );
}

function ConnectedTabsFixture({
  initialValue = 'overview',
  width = 760,
}: {
  initialValue?: ExampleTab;
  width?: number;
}) {
  const [value, setValue] = useState<ExampleTab>(initialValue);
  return (
    <Box p="xl" w={width} maw="calc(100vw - 2rem)">
      <ConnectedTabs
        value={value}
        onValueChange={setValue}
        items={items}
        ariaLabel="Workbench sections"
      />
    </Box>
  );
}

function ResizeDrivenFixture() {
  const [width, setWidth] = useState(760);
  return (
    <Box p="xl">
      <Button type="button" mb="md" onClick={() => setWidth((current) => current - 240)}>
        Resize workbench
      </Button>
      <ConnectedTabsFixture initialValue="people" width={width} />
    </Box>
  );
}

const meta = preview.meta({
  title: 'App/Content/ConnectedTabs',
  component: ConnectedTabsFixture,
  parameters: {
    layout: 'fullscreen',
  },
});

export const FirstActive = meta.story({
  args: { initialValue: 'overview' },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector('[class*="glassSurface"]')).not.toBeNull();
      expect(canvasElement.querySelector('svg[class*="geometryContour"] path')).not.toBeNull();
    });

    const surface = canvasElement.querySelector<HTMLElement>('[class*="glassSurface"]');
    await expect(getComputedStyle(surface as HTMLElement).backdropFilter).toBe('blur(8px)');
  },
});

export const MiddleActive = meta.story({
  args: { initialValue: 'people' },
});

export const FinalActive = meta.story({
  args: { initialValue: 'settings' },
});

export const ResizeDrivenGeometry = meta.story({
  render: () => <ResizeDrivenFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const contour = canvasElement.querySelector('svg[class*="geometryContour"] path');
    const initialPath = contour?.getAttribute('d');
    await userEvent.click(canvas.getByRole('button', { name: 'Resize workbench' }));
    await waitFor(() => expect(contour?.getAttribute('d')).not.toBe(initialPath));
  },
});

export const KeyboardAndPointerActivation = meta.story({
  args: { initialValue: 'overview' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overview = canvas.getByRole('tab', { name: 'Overview' });
    overview.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('tab', { name: 'People' })).toHaveAttribute(
      'data-state',
      'active'
    );
    await userEvent.click(canvas.getByRole('tab', { name: 'Settings' }));
    await expect(
      canvas.getByText('The final tab joins the panel at its lower edge.')
    ).toBeVisible();
  },
});

export const OverflowPreserved = meta.story({
  args: { initialValue: 'people', width: 560 },
  render: (args) => (
    <Box p="xl">
      <ConnectedTabsFixture {...args} />
      <Box data-testid="overflow-marker" w={48} h={48} ml={540} mt={-80} bg="dune.7" />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('overflow-marker')).toBeVisible();
    const root = canvasElement.querySelector('[role="tablist"]')?.parentElement;
    await expect(getComputedStyle(root as Element).overflow).toBe('visible');
  },
});

import { Anchor } from '@mantine/core';
import preview from '@sb/preview';
import { useEffect, useState } from 'react';
import { expect, within } from 'storybook/test';

import { AppBackground } from '@app/shell/AppBackground';

import { TableWait } from './TableWait';

const meta = preview.meta({
  component: TableWait,
  parameters: { layout: 'fullscreen' },
  /* The frame is see-through over the app's own background, whose planet it raises and circles, and fills the window as on the game page. */
  decorators: [
    (Story) => (
      <>
        <AppBackground motion />
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </>
    ),
  ],
  args: { status: 'Joining the table…' },
});

/** The one frame every table route shows while something is on its way: the app's planet risen to the centre, its moons, and a status line. */
export const Waiting = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('Joining the table…');
  },
});

/** The controls that stay reachable while waiting, such as the way back to the lobby. */
export const WithWayBack = meta.story({
  args: {
    status: 'Waiting for the host to admit you.',
    children: <Anchor href="#lobby">Back to the lobby</Anchor>,
  },
});

/* The lines a real opening walks through, each from its own frame. */
const OPENING = [
  'Loading the game...',
  'Loading the table...',
  'Connecting to the hosted table...',
  'Opening the table...',
];

/** Remounts the frame for each line, as the game page does, so the moons are seen carrying on across the waits. */
function Opening() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((current) => (current + 1) % OPENING.length), 2600);
    return () => clearInterval(timer);
  }, []);
  return (
    <TableWait key={step} status={OPENING[step]}>
      <Anchor href="#lobby">Lobby</Anchor>
    </TableWait>
  );
}

/** The waits of a real opening one after another, with motion on. */
export const Opening_ = meta.story({ name: 'Opening', globals: { motion: 'on' }, render: () => <Opening /> });

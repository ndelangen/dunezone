import { Anchor } from '@mantine/core';
import preview from '@sb/preview';
import { useEffect, useState } from 'react';
import { expect, within } from 'storybook/test';

import { TableWait } from './TableWait';
import type { TableWaitLook } from './TableWaitArt';

const meta = preview.meta({
  component: TableWait,
  parameters: { layout: 'fullscreen' },
  /* The frame fills the page it is given, as it fills the game page's content. */
  decorators: [
    (Story) => (
      <div style={{ height: '100vh' }}>
        <Story />
      </div>
    ),
  ],
  args: { status: 'Joining the table…' },
});

/** The one frame every table route shows while something is on its way: a status line in the near-black frame. */
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

/* The lines a real opening walks through, each from its own frame, so a look is judged across the whole wait. */
const OPENING = [
  'Loading the game...',
  'Loading the table...',
  'Connecting to the hosted table...',
  'Opening the table...',
];

/** Remounts the frame for each line, as the game page does, so the art's motion is seen carrying across the waits. */
function Opening({ look }: Readonly<{ look: TableWaitLook }>) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((current) => (current + 1) % OPENING.length), 2600);
    return () => clearInterval(timer);
  }, []);
  return (
    <TableWait key={step} look={look} status={OPENING[step]}>
      <Anchor href="#lobby">Lobby</Anchor>
    </TableWait>
  );
}

/** Today's look: a breathing pool of light behind the status line. */
export const LookPool = meta.story({ globals: { motion: 'on' }, render: () => <Opening look="pool" /> });
/** The storm sweeps the board's eighteen sectors; each one flares as the front passes. */
export const LookStorm = meta.story({ globals: { motion: 'on' }, render: () => <Opening look="storm" /> });
/** The board's eighteen sectors fall into place one by one, glint once whole, and lift away. */
export const LookBoard = meta.story({ globals: { motion: 'on' }, render: () => <Opening look="board" /> });
/** Shai-Hulud's maw: rings of teeth turn against each other while the sand is drawn in. */
export const LookWorm = meta.story({ globals: { motion: 'on' }, render: () => <Opening look="worm" /> });
/** A thumper's beat sends rings across rippled sand, and every fourth beat a gold swell answers. */
export const LookThumper = meta.story({ globals: { motion: 'on' }, render: () => <Opening look="thumper" /> });
/** Arrakis and its two moons on tilted orbits through slow stars. */
export const LookMoons = meta.story({ globals: { motion: 'on' }, render: () => <Opening look="moons" /> });
/** The deep desert: dune ridges drift past at three depths under a low sun, sand blowing off the crests. */
export const LookDunes = meta.story({ globals: { motion: 'on' }, render: () => <Opening look="dunes" /> });

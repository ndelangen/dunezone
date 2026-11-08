import { Anchor } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { useEffect, useState } from 'react';

import { ShellBackground } from '@app/shell/ShellStoryPage.stories.fixture';

import { TableWait } from './TableWait';

/* A timed sequence, so it is a testing story: Chromatic would capture whichever line it reached. */
const meta = testingPreview.meta({
  component: TableWait,
  /* The frame is part of the table's arrival, so its moons move wherever motion is on. */
  parameters: { layout: 'fullscreen', tableArrival: 'play' },
  decorators: [
    (Story) => (
      <>
        <ShellBackground />
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </>
    ),
  ],
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

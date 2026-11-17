import { Stack } from '@mantine/core';
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { setPointerNames } from './pointerNames';
import { HandLabel } from './ScenePresence';

/* Pointer colours from light to the darkest faction colours seen at a playtest table (#2993). */
const COLOURS = ['#e8c45a', '#5f8f3a', '#2f6fb0', '#8a2b2b', '#3b2a5c', '#1f2a44', '#202020'];

function HandLabels() {
  return (
    <div style={{ background: 'var(--table-top)', padding: 32 }} data-scheme-dark>
      <Stack gap="lg" align="flex-start">
        {COLOURS.map((color, index) => (
          <HandLabel key={color} color={color} displayName={`Player ${index + 1}`} local={false} demo={false} />
        ))}
      </Stack>
    </div>
  );
}

const meta = preview.meta({ title: 'Play/Pointer hand labels', component: HandLabels });

/** Every player's name reads on the table, whatever their colour; the colour stays in the label's edge. */
export const DarkFactionColours = meta.story({
  /* The names show by default; a switch left off in this browser must not hide them here. */
  beforeEach: () => setPointerNames(true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Player 7')).toBeVisible();
  },
});

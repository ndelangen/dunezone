import { testingPreview } from '@sb/preview';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import { BattleWheel } from './BattleWheel';
import { artwork, revealedArgs } from './BattleWheel.stories.fixture';
import { battleWheelMeta } from './BattleWheel.stories.fixture';

const meta = testingPreview.meta({ ...battleWheelMeta });
function RevealExample(args: ComponentProps<typeof BattleWheel>) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), 800);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div style={{ width: 170, height: 170 }}>
      <BattleWheel
        {...(started && args.state === 'revealed'
          ? { ...revealedArgs, ...args }
          : args.state === 'unrevealed'
            ? { ...args, artwork: args.artwork ?? artwork, ready: args.ready ?? true }
            : { state: 'unrevealed', label: 'Atreides, ready', artwork, ready: true })}
      />
    </div>
  );
}

export const Reveal = meta.story({
  args: revealedArgs,
  render: (args) => <RevealExample {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wheel = canvas.getByRole('img', { name: 'Atreides, ready' });
    await expect(wheel).toBeVisible();
    await expect(canvas.queryByText('No leader')).toBeNull();
    await waitFor(() => expect(wheel).toHaveAttribute('data-state', 'revealed'));
    await expect(canvas.getByText('No leader')).toBeInTheDocument();
    const animations = canvasElement.getAnimations({ subtree: true });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const reveal = animations.find((animation) => animation.effect?.getTiming().duration === 400);
      await expect(reveal).toBeDefined();
      reveal!.finish();
    } else {
      await expect(animations).toHaveLength(0);
    }
    await expect(canvas.getByText('No leader')).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
});

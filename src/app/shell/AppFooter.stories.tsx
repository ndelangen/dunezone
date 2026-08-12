import preview from '@sb/preview';

import { AppFooter } from './AppFooter';

const meta = preview.meta({
  component: AppFooter,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "The shell's closing waypoints. It owns its own list and destinations — there is nothing to hand it, so this is the whole component. Its colours assume the dark document background; the shell's `<footer>` element supplies only the minimum height around it.",
      },
    },
  },
});

export const Default = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

/** The waypoints stack once the row no longer fits. */
export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});

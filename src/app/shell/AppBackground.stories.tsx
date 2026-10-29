import preview from '@sb/preview';

import { AppBackground } from './AppBackground';
import { ShellPageBackdrop } from './ShellStoryPage.stories.fixture';

const meta = preview.meta({
  component: AppBackground,
  parameters: { layout: 'fullscreen' },
  args: { motion: false },
  decorators: [
    (Story) => (
      <ShellPageBackdrop>
        <div data-app-root style={{ minHeight: '100vh' }}>
          <Story />
        </div>
      </ShellPageBackdrop>
    ),
  ],
});

export const Still = meta.story({});

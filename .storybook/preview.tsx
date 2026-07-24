import { MantineProvider } from '@mantine/core';
import addonDocs from '@storybook/addon-docs';
import { definePreview } from '@storybook/react-vite';
import { sb } from 'storybook/test';

import '@mantine/core/styles.layer.css';
import '../src/app/styles/fonts.css';
import '../src/app/styles/tokens.css';
import '../src/app/styles/mantine-shell-compatibility.css';

import { appContentTheme } from '../src/app/theme';
import * as sizes from '../src/game/data/sizes';

sb.mock(import('@tanstack/react-router'));

export default definePreview({
  addons: [addonDocs()],
  parameters: {
    layout: 'centered',
    viewport: {
      options: {
        page: {
          name: 'Page',
          styles: {
            width: `${Math.round(sizes.page.width)}px`,
            height: `${Math.round(sizes.page.height)}px`,
          },
        },
        card: {
          name: 'Card',
          styles: {
            width: `${Math.round(sizes.card.width)}px`,
            height: `${Math.round(sizes.card.height)}px`,
          },
        },
        shield: {
          name: 'Shield',
          styles: {
            width: `${Math.round(sizes.shield.width)}px`,
            height: `${Math.round(sizes.shield.height)}px`,
          },
        },
        disc: {
          name: 'Disc',
          styles: {
            width: `${Math.round(sizes.disc.width)}px`,
            height: `${Math.round(sizes.disc.height)}px`,
          },
        },
        scene: {
          name: 'Scene',
          styles: {
            width: `1000px`,
            height: `1100px`,
          },
        },
        appDesktop: {
          name: 'App desktop',
          styles: {
            width: '1200px',
            height: '900px',
          },
        },
        appLarge: {
          name: 'App large',
          styles: {
            width: '1440px',
            height: '1200px',
          },
        },
        appConstrained: {
          name: 'App constrained',
          styles: {
            width: '860px',
            height: '760px',
          },
        },
        appMobile: {
          name: 'App mobile',
          styles: {
            width: '390px',
            height: '844px',
          },
        },
      },
    },
  },
  decorators: [
    (Story, { globals, title }) => {
      const { viewport } = globals;
      const viewportValue = viewport.value as keyof typeof sizes;
      let size: typeof sizes.page | undefined;
      if (viewportValue === 'page') {
        size = sizes.page;
      } else if (viewportValue === 'card') {
        size = sizes.card;
      } else if (viewportValue === 'shield') {
        size = sizes.shield;
      } else if (viewportValue === 'disc') {
        size = sizes.disc;
      }
      const story = size ? (
        <div style={{ ...size }}>
          <Story />
        </div>
      ) : (
        <Story />
      );

      if (title.startsWith('App/')) {
        return (
          <MantineProvider theme={appContentTheme} forceColorScheme="light">
            {story}
          </MantineProvider>
        );
      }

      return story;
    },
  ],
  initialGlobals: {
    backgrounds: {
      value: '#333333',
      grid: true,
    },
  },
});

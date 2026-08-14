import { MantineProvider } from '@mantine/core';
import addonDocs from '@storybook/addon-docs';
import { definePreview } from '@storybook/tanstack-react';
import { sb } from 'storybook/test';

import '@mantine/core/styles.layer.css';
import '../src/app/styles/fonts.css';
import '../src/app/styles/tokens.css';
import '../src/app/styles/mantine-shell-compatibility.css';
import { setMotionOverride } from '../src/app/shell/motion';
import { appContentTheme } from '../src/app/ui/theme';
import * as sizes from '../src/game/data/sizes';

/* Storybook has no backend or auth context. Connected components must opt into
   deterministic, per-story return values from these network-incapable mocks. */
sb.mock(import('convex/react'));
sb.mock(import('convex/browser'));

export default definePreview({
  addons: [addonDocs()],
  globalTypes: {
    motion: {
      description: "Ambient motion: the chrome's band video and turning dice",
      toolbar: {
        title: 'Motion',
        icon: 'play',
        items: [
          { value: 'auto', title: 'Motion: follow this browser' },
          { value: 'on', title: 'Motion: on' },
          { value: 'reduce', title: 'Motion: reduced' },
        ],
        dynamicTitle: true,
      },
    },
  },
  /* The toolbar drives the real `motion` cookie override rather than a module mock, so stories
     exercise the same code path visitors do; `auto` clears it back to the browser's own hint. */
  beforeEach: ({ globals }) => {
    setMotionOverride(globals.motion === 'on' ? 'on' : globals.motion === 'reduce' ? 'off' : null);
  },
  parameters: {
    layout: 'centered',
    viewport: {
      options: {
        /* Constrained widths a story can select when its subject *is* the behaviour at that
           width. Stories are otherwise left responsive, which is the more useful default. */
        contentNarrow: { name: 'Content narrow', styles: { width: '260px', height: '620px' } },
        contentColumn: { name: 'Content column', styles: { width: '620px', height: '620px' } },
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
        appAuthoringWide: {
          name: 'Authoring wide',
          styles: {
            width: '1280px',
            height: '900px',
          },
        },
        appAuthoringCompact: {
          name: 'Authoring compact',
          styles: {
            width: '1074px',
            height: '1199px',
          },
        },
        appAuthoringTablet: {
          name: 'Authoring tablet',
          styles: {
            width: '900px',
            height: '1000px',
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

      /* Everything but the game assets is themed interface. Game assets are self-contained SVG
         renderers that carry their own colour and must not inherit the app's palette. */
      if (!title.startsWith('Game Assets/')) {
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
    motion: 'auto',
    backgrounds: {
      value: '#333333',
      grid: true,
    },
  },
});

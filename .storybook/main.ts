import { defineMain } from '@storybook/react-vite/node';

export default defineMain({
  stories: [
    {
      directory: '../src/app/components',
      titlePrefix: 'App',
    },
    {
      directory: '../src/game/assets/faction',
      titlePrefix: 'Game Assets/Faction',
    },
    {
      directory: '../src/game/assets/card',
      titlePrefix: 'Game Assets/Cards',
    },
    {
      directory: '../src/game/assets/treachery',
      titlePrefix: 'Game Assets/Cards/Treachery',
    },
    {
      directory: '../src/game/assets/token',
      titlePrefix: 'Game Assets/Tokens',
    },
    {
      directory: '../src/game/assets/utils',
      titlePrefix: 'Game Assets/Composition',
    },
    {
      directory: '../src/game/components/block',
      titlePrefix: 'Game Assets/Composition/Blocks',
    },
    {
      directory: '../src/game/book',
      titlePrefix: 'Book',
    },
  ],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {
      builder: {
        viteConfigPath: '.storybook/vite.config.ts',
      },
    },
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  staticDirs: ['../public'],
});

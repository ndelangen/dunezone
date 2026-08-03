import { defineMain } from '@storybook/tanstack-react/node';

const managerTitleScript = `
  <script>
    (() => {
      const brandedTitle = 'Dune Zone Storybook';
      const updateTitle = () => {
        const current = document.title;
        const next = current.endsWith(' ⋅ Storybook')
          ? current.replace(/ ⋅ Storybook$/, ' ⋅ ' + brandedTitle)
          : current.endsWith(' - Storybook')
            ? current.replace(/ - Storybook$/, ' - ' + brandedTitle)
            : current === 'Storybook'
              ? brandedTitle
              : current;
        if (next !== current) document.title = next;
      };
      const title = document.querySelector('title');
      if (title) new MutationObserver(updateTitle).observe(title, { childList: true });
      updateTitle();
    })();
  </script>
`;

export default defineMain({
  stories: [
    {
      directory: '../src/app/components/factions',
      files: '*.stories.tsx',
      titlePrefix: 'Application/Factions',
    },
    {
      directory: '../src/app/components/factions/editor',
      titlePrefix: 'Application/Factions/Editor',
    },
    {
      directory: '../src/app/components/faq',
      titlePrefix: 'Application/FAQ',
    },
    {
      directory: '../src/app/components/groups',
      titlePrefix: 'Application/Groups',
    },
    {
      directory: '../src/app/components/topics',
      titlePrefix: 'Application/Topics',
    },
    {
      directory: '../src/app/components/content',
      titlePrefix: 'Application/Shared Content',
    },
    {
      directory: '../src/app/components/foundation',
      titlePrefix: 'Application/Foundation',
    },
    {
      directory: '../src/app/components/form',
      titlePrefix: 'Application/Legacy/Form',
    },
    {
      directory: '../src/app/components/generic/layout',
      titlePrefix: 'Application/Legacy/Layout',
    },
    {
      directory: '../src/app/components/generic/surfaces',
      titlePrefix: 'Application/Legacy/Surfaces',
    },
    {
      directory: '../src/app/components/generic/ui',
      titlePrefix: 'Application/Legacy/UI',
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
  ],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/tanstack-react',
    options: {
      builder: {
        viteConfigPath: '.storybook/vite.config.ts',
      },
    },
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  managerHead: (head) => `${head}${managerTitleScript}`,
  staticDirs: (existing = [], { configType }) =>
    configType === 'DEVELOPMENT' ? [...existing, '../public'] : existing,
});

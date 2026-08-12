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
      directory: '../src/app/widgets/faction-editor',
      titlePrefix: 'Widgets/Faction Editor',
    },
    {
      directory: '../src/ui/block',
      titlePrefix: 'Blocks',
    },
    {
      directory: '../src/app/components/block',
      titlePrefix: 'Blocks',
    },
    {
      directory: '../src/ui/control',
      titlePrefix: 'Controls',
    },
    {
      directory: '../src/app/components/control',
      titlePrefix: 'Controls',
    },
    {
      directory: '../src/ui/content',
      titlePrefix: 'Content',
    },
    {
      directory: '../src/app/components/content',
      titlePrefix: 'Content',
    },
    {
      directory: '../src/ui/list',
      titlePrefix: 'Lists',
    },
    {
      directory: '../src/app/components/list',
      titlePrefix: 'Lists',
    },
    {
      directory: '../src/ui/surface',
      titlePrefix: 'Surfaces',
    },
    {
      directory: '../src/ui/layout',
      titlePrefix: 'Layout',
    },
    {
      directory: '../src/app/components/layout',
      titlePrefix: 'Layout',
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
  addons: ['@storybook/addon-docs', '@storybook/addon-vitest'],
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

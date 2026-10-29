import { Anchor } from '@mantine/core';
import { Bullets } from '@ui/list/Bullets';
import { SiTypescript } from 'react-icons/si';
import { VscJson, VscTerminal } from 'react-icons/vsc';

const GUARDS = [
  {
    check: '.oxlintrc.json',
    path: '.oxlintrc.json',
    icon: VscJson,
    detail: 'Keeps fetching and navigation out of the kit and Convex out of everything but src/app/db.',
  },
  {
    check: 'bun run check:app-layout',
    path: 'scripts/assert-app-layout.ts',
    icon: VscTerminal,
    detail: 'Rejects folders outside the documented src/app structure.',
  },
  {
    check: 'bun run check:breakpoints',
    path: 'scripts/assert-breakpoints.ts',
    icon: VscTerminal,
    detail: 'Checks that width media queries use the allowed chrome files and the 30, 48 and 62rem breakpoints.',
  },
  {
    check: 'bun run check:css-orphans',
    path: 'scripts/assert-no-orphan-css-classes.ts',
    icon: VscTerminal,
    detail: 'Finds unused stylesheets and CSS classes.',
  },
  {
    check: 'rendererIsolation.test.ts',
    path: 'src/game/rendererIsolation.test.ts',
    icon: SiTypescript,
    detail: 'Keeps Mantine and the app out of the game renderers.',
  },
  {
    check: 'PageLayout.architecture.test.ts',
    path: 'src/app/ui/layout/PageLayout.architecture.test.ts',
    icon: SiTypescript,
    detail: 'Checks that each page renders its own PageLayout.',
  },
  {
    check: 'bun run storybook:test',
    path: 'vitest.storybook.config.ts',
    icon: VscTerminal,
    detail: 'Runs stories in a real browser, including their interaction checks.',
  },
];

export function CodeChecks() {
  return (
    <Bullets gap="md">
      {GUARDS.map((guard) => {
        const Icon = guard.icon;
        return (
          <Bullets.Item
            key={guard.check}
            icon={<Icon size={18} />}
            title={
              <Anchor href={`https://github.com/ndelangen/dunezone/blob/main/${guard.path}`} ff="monospace" size="sm">
                {guard.check}
              </Anchor>
            }
            detail={guard.detail}
          />
        );
      })}
    </Bullets>
  );
}

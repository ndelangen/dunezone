import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { FactionCard } from '../block/FactionCard';
import { OpenableTile } from '../block/OpenableTile';
import { Card } from '../surface/Card';
import { expectFactionColumns } from './factionListPlay';
import { TileGrid } from './TileGrid';
import { factions } from './TileGrid.stories.fixture';

const art = (tone: string) => <div style={{ width: '100%', aspectRatio: '1 / 1.4', background: tone }} />;

const meta = preview.meta({
  component: TileGrid,
  parameters: { layout: 'padded' },
});

/** The one rhythm every openable-tile surface shares; tiles come from the caller. */
export const Default = meta.story({
  render: () => (
    <TileGrid>
      {['#887849', '#4d4623', '#8f2c1c', '#2c3e50', '#574b2a'].map((tone, index) => (
        <OpenableTile
          key={tone}
          caption={`Tile ${index + 1}`}
          renderRoot={({ children, ...rest }) => (
            <a {...rest} href={`#tile-${index + 1}`}>
              {children}
            </a>
          )}
        >
          {art(tone)}
        </OpenableTile>
      ))}
    </TileGrid>
  ),
  play: async ({ canvasElement }) => {
    const links = within(canvasElement).getAllByRole('link');
    await expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(
      [1, 2, 3, 4, 5].map((index) => [`Tile ${index}`, `#tile-${index}`])
    );
  },
});

export const Compact = meta.story({
  render: () => (
    <div style={{ width: 240 }}>
      <TileGrid size="compact">
        {[1, 2].map((number) => (
          <OpenableTile
            key={number}
            caption={`Tile ${number}`}
            renderRoot={({ children, ...props }) => (
              <a {...props} href={`#tile-${number}`}>
                {children}
              </a>
            )}
          >
            {art('#887849')}
          </OpenableTile>
        ))}
      </TileGrid>
    </div>
  ),
});

const factionCards = (list = factions, selectedRulesetSlug?: string) => (
  <TileGrid size="card">
    {list.map((faction) => (
      <FactionCard key={faction._id} faction={faction} selectedRulesetSlug={selectedRulesetSlug} />
    ))}
  </TileGrid>
);

/**
 * Faction cards.
 * From the tablet step the row takes as many columns as fit at 11.5rem or wider, which keeps a card around 200px: five across a laptop window.
 * A laptop window rather than a desktop one, because at 1200px the canvas's 1rem padding leaves a 1168px list and five columns, and the test run renders no padding, so its 1200px list shows six.
 */
export const FactionCards = meta.story({
  render: () => factionCards(),
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) => {
    await expectFactionColumns(canvasElement, 5);
  },
});

/** Faction cards on a phone-wide page are two columns across. */
export const FactionCardsMobile = meta.story({
  render: () => factionCards(),
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    await expectFactionColumns(canvasElement, 2);
  },
});

/**
 * With a ruleset chosen, each card marks its membership against that one rather than listing all of them.
 * Classic is chosen because it is Fremen's second ruleset, so its caption changes where Advanced would leave it as it was.
 */
export const FactionCardsWithSelectedRuleset = meta.story({
  render: () => factionCards(factions, 'classic'),
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    /* Every fixture card carries the same faction document, so the ruleset captions tell them apart in list order. */
    const links = within(canvasElement).getAllByRole('link');
    const captions = ['Atreides Advanced Dune', 'Atreides Classic Dune', 'Atreides Classic Dune +1', 'Atreides'];
    for (const [index, caption] of captions.entries()) {
      await expect(links[index]).toHaveAccessibleName(`${caption} Novice complexity, 2 out of 10`);
    }
  },
});

const games = ['Arrakeen picnic', 'Sietch Tabr supper', 'Carthag court', 'Giedi Prime gala', 'Kaitain ball'];

const wideCards = () => (
  <TileGrid size="wide" aria-label="Games">
    {games.map((name) => (
      <Card key={name} title={name} padding="md">
        <div style={{ aspectRatio: '1', borderRadius: '50%', border: '1px dashed currentColor' }} />
      </Card>
    ))}
  </TileGrid>
);

/** Wide titled cards, three to a row on a wide page. */
export const Wide = meta.story({
  render: wideCards,
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const items = within(within(canvasElement).getByRole('list', { name: 'Games' })).getAllByRole('listitem');
    const tops = items.map((item) => Math.round(item.getBoundingClientRect().top));
    await expect(tops.filter((top) => top === tops[0])).toHaveLength(3);
  },
});

/** Wide cards one to a row when the grid itself is narrow. */
export const WideNarrow = meta.story({
  render: wideCards,
  globals: { viewport: { value: 'contentNarrow' } },
  play: async ({ canvasElement }) => {
    const items = within(within(canvasElement).getByRole('list', { name: 'Games' })).getAllByRole('listitem');
    const lefts = items.map((item) => Math.round(item.getBoundingClientRect().left));
    await expect(new Set(lefts).size).toBe(1);
  },
});

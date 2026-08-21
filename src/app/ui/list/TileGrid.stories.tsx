import preview from '@sb/preview';

import { OpenableTile } from '../block/OpenableTile';
import { TileGrid } from './TileGrid';

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
});

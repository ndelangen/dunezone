import { useState } from 'react';

import { SortableRow } from './SortableRow';

const TILES = ['Crysknife', 'Shield', 'Snooper', 'Chaumas', 'Cheap Hero'].map((name) => ({ id: name, name }));

/** A row of named tiles in the order the reader puts them, with the last tile let go outside the row named beneath it. */
export function SortableRowDemo() {
  const [tiles, setTiles] = useState(TILES);
  const [outside, setOutside] = useState<string>();
  return (
    <div style={{ display: 'grid', gap: 24, width: '22rem' }}>
      <SortableRow
        items={tiles}
        label="Tiles"
        onMove={(tile, before) =>
          setTiles((current) => {
            const rest = current.filter((other) => other.id !== tile.id);
            const at = before ? rest.findIndex((other) => other.id === before) : rest.length;
            rest.splice(at, 0, tile);
            return rest;
          })
        }
        onDropOutside={(tile) => setOutside(tile.name)}
      >
        {(tile) => (
          <div
            role="img"
            aria-label={tile.name}
            style={{
              display: 'inline-grid',
              placeItems: 'center',
              width: 64,
              height: 84,
              marginInlineEnd: 8,
              borderRadius: 6,
              background: 'var(--color-paper)',
              color: 'var(--color-text)',
              fontSize: 12,
              cursor: 'grab',
            }}
          >
            {tile.name}
          </div>
        )}
      </SortableRow>
      <output aria-label="Let go outside">{outside ?? 'Nothing let go outside yet'}</output>
    </div>
  );
}

import { arrakisBoard } from '@shared/boards/geometry';
import { expect, test } from 'vite-plus/test';

import { territoryTintPresets } from './territoryTintPresets';

test('the Arrakis board offers the Fremen deployment zone and the Shield Wall', () => {
  const [fremen, shieldWall] = territoryTintPresets(arrakisBoard());
  expect(fremen).toMatchObject({ name: 'Fremen deployment', color: '#2b5ea7' });
  expect([...fremen.territories].sort((a, b) => a.localeCompare(b))).toEqual(
    [
      'bight_of_the_cliff',
      'broken_land',
      'cielago_west',
      'false_wall_west',
      'funeral_plain',
      'habbanya_erg',
      'hagga_basin',
      'plastic_basin',
      'polar_sink',
      'rock_outcroppings',
      'tabr',
      'the_great_flat',
      'the_greater_flat',
      'tsimpo',
      'wind_pass',
      'wind_pass_north',
    ].sort((a, b) => a.localeCompare(b))
  );
  expect(shieldWall).toEqual({
    name: 'Shield Wall destroyed',
    color: '#1b1b1b',
    stamps: ['explode'],
    territories: ['shield_wall'],
  });
});

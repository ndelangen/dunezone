import { publishedPath } from '@shared/asset-publishing/publicationTargets';
import { PUBLIC_SITE_ORIGIN } from '@shared/publicDiscovery';
import { createLink } from '@tanstack/react-router';
import { OpenableTile } from '@ui/block/OpenableTile';
import { TileGrid } from '@ui/list/TileGrid';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

import { AssetFace } from '@app/widgets/asset-face/AssetFace';

/* Real Spice cards on dune.zone, each drawn on the saved Arrakis board; their published images follow the board when it changes. */
const SPICE_CARDS = [
  { name: 'The Great Flat', slug: 'the-great-flat-2', id: 'ns74bj6r0gcdmwbrxps05b31v98gv9g5' },
  { name: 'Hagga Basin', slug: 'hagga-basin-3', id: 'ns791yy132xqr9ygwxeh20nab58gthk8' },
  { name: 'Gaia Kulon', slug: 'gaia-kulon-1', id: 'ns7f3ye20hrymr19evxf3nrjqh8gswzn' },
  { name: 'Ceilago West', slug: 'ceilago-west-1', id: 'ns7dmhkm00gs54zgc9jxzj0bt58grvdy' },
  { name: 'Ceilago East', slug: 'ceilago-east-1', id: 'ns7aqrydhhm0whq2464fpdeks98grn74' },
  { name: 'Bight of the Cliff', slug: 'bight-of-the-cliff-1', id: 'ns71qnp0s60g9q4c0b2933myn98gsveh' },
  { name: 'Old Gap', slug: 'old-gap-2', id: 'ns72cs3f04f18ens6x7y9ejsnh8gn7xx' },
  { name: 'Wind Pass North', slug: 'wind-pass-north-2', id: 'ns7f9dqp4jmq1kgyksd42td0198gmv5n' },
  { name: 'Funeral Plain', slug: 'funeral-plain-2', id: 'ns7e0q8vnxbzkr7v7wvbnrj59x8gmbks' },
  { name: 'Hagga Basin', slug: 'hagga-basin-2', id: 'ns77efejn3xcpt1gdznc0ey1ks8gn5dh' },
] as const;

/* A plain anchor made a router link through `createLink`, as `PostLink` is, so the post's markup tests can draw it without a router. */
const CardLink = createLink(
  forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<'a'>>(function CardLink({ children, ...props }, ref) {
    return (
      <a ref={ref} {...props}>
        {children}
      </a>
    );
  })
);

/** A row of the site's own Spice cards, as the asset catalogue shows them, each opening its card page. */
export function SpiceCards() {
  return (
    <TileGrid aria-label="Spice cards on the saved Arrakis board">
      {SPICE_CARDS.map((card) => (
        <OpenableTile
          key={card.id}
          caption={card.name}
          renderRoot={(rootProps) => (
            <CardLink {...rootProps} to="/assets/$type/$slug" params={{ type: 'card-spice', slug: card.slug }} />
          )}
        >
          <AssetFace
            href={`${PUBLIC_SITE_ORIGIN}${publishedPath('card-spice', card.id)}`}
            type="card-spice"
            data={null}
            name={card.name}
          />
        </OpenableTile>
      ))}
    </TileGrid>
  );
}

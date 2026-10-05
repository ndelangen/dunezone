import type { TroopArtwork } from '@shared/factions/schema';
import type { RulebookRenderFactionV1 } from '@shared/rulebooks/renderDocument';
import type { ComponentProps } from 'react';
import type { z } from 'zod';

import type { TroopToken } from '../assets/faction/troop/Troop';

/** A selected face needs both its own artwork and its faction's background. */
export function rulebookTroopArtwork(selection: {
  faction: RulebookRenderFactionV1;
  artwork?: z.infer<typeof TroopArtwork>;
  face: 'front' | 'back';
}): ComponentProps<typeof TroopToken> | undefined {
  const token = selection.faction.status === 'ready' ? selection.faction.token : undefined;
  const artwork = selection.face === 'back' ? selection.artwork?.back : selection.artwork;
  return token && artwork
    ? {
        background: token.background,
        image: artwork.image,
        star: artwork.star,
        hue: artwork.hue,
        striped: artwork.striped,
      }
    : undefined;
}

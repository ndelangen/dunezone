import { pageHead } from '../../pageTitle';
import { publicPageHead } from '../../publicPage';
import { mediaKinds } from './mediaSearchParams';

type GallerySlug = (typeof mediaKinds)[number]['slug'];

/** What each gallery shows, in the words its search results page should be found by. */
const galleryLeads: Partial<Record<GallerySlug, string>> = {
  decals: 'Decal artwork of weapons, creatures, machines and symbols',
  symbols: 'General symbols and shapes',
  emblems: 'Faction emblems and logos',
  icons: 'Game icons for actions, phases and resources',
  troops: 'Troop token artwork for every faction',
  leaders: 'Leader portraits from the official game and from custom factions',
  planets: 'Planet artwork',
  covers: 'Rulebook cover illustrations',
};

const social = { kind: 'Media library', shape: 'portrait' } as const;

/**
 * The overview and each game gallery are public pages, and every filter or opened item on them points Google at the gallery.
 * The icon libraries keep the plain title.
 * An unknown gallery is a 404, so it leaves the title to the not-found page.
 */
export function mediaHead(params: { source?: string; kind?: string }, match?: { status: string }) {
  if (!params.source) {
    return publicPageHead({
      name: 'Media catalogue',
      pathname: '/media',
      description:
        'Browse the artwork behind Dune Zone: leader portraits, decals, faction emblems, troop tokens, planets, game icons and rulebook covers. Every image has a written description you can search.',
      social,
      match,
    });
  }
  const gallery = mediaKinds.find((kind) => kind.slug === params.kind);
  if (params.source !== 'game') {
    return pageHead('Media catalogue', { match });
  }
  const lead = gallery ? galleryLeads[gallery.slug] : undefined;
  if (!gallery || !lead) {
    return {};
  }
  return publicPageHead({
    name: gallery.label,
    pathname: `/media/game/${gallery.slug}`,
    description: `${lead} in the Dune Zone media library. Each image has a written description and keywords, so you can search by what it shows.`,
    social,
    match,
  });
}

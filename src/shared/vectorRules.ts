/**
 * Per-category rules for the vector train (wayfinder #294, decided in #296/#297/#298): every
 * `media/vector/<category>/<name>.svg` source generates a normalized, optimized file at
 * `public/vector/<category>/<name>.svg`.
 * Consumers keep referencing `/vector/<cat>/<name>.svg#root`;
 * the train changes bytes, never URLs.
 *
 * The one coordinate space: every generated file has viewBox `0 0 100 100`, art centered (`xMidYMid meet` semantics), zero padding;
 * the box is the art.
 * `overflow="visible"` on the root is the halo-clipping fix.
 * Backgrounds' coordinates are genuinely rescaled in the path data because fragment `<use href="…#arrakeen">` clones elements without ancestor transforms.
 *
 * Paint policy: `inherit` categories must carry NO baked paint (fill/stroke comes from the consumer);
 * `baked` requires the `-multicolor` name suffix within the decal category.
 */

export const VECTOR_VIEWBOX_SIZE = 100;
/** Output coordinate precision: 2 decimals = 1/10,000 of the box. */
export const VECTOR_PRECISION = 2;
/** Root attribute every generated file must carry so `<use href="…#root">` resolves. */
export const VECTOR_ROOT_ID = 'root';

/**
 * Retired copies resolve to the artwork they duplicate.
 * Saved identifiers remain readable and keep their file, but pickers only offer the canonical artwork.
 */
export const VECTOR_ARTWORK_ALIASES: Readonly<Record<string, string>> = {
  '/vector/decal/balance.svg': '/vector/generic/yin-yang.svg',
  '/vector/decal/barge.svg': '/vector/generic/mantis-cruiser.svg',
  '/vector/decal/palace.svg': '/vector/icon/stronghold.svg',
  '/vector/icon/arrakis-city.svg': '/vector/icon/city.svg',
  '/vector/icon/arrakis-sietch.svg': '/vector/icon/seitch.svg',
  '/vector/decal/beaurocrat-multicolor.svg': '/vector/decal/bureaucrat-multicolor.svg',
  '/vector/decal/beaurocrat.svg': '/vector/decal/bureaucrat.svg',
  '/vector/decal/distrance-multicolor.svg': '/vector/decal/distrans-multicolor.svg',
  '/vector/decal/distrance.svg': '/vector/decal/distrans.svg',
  '/vector/decal/knifes.svg': '/vector/decal/knives.svg',
  '/vector/decal/suringe.svg': '/vector/decal/syringe.svg',
  '/vector/generic/6star.svg': '/vector/generic/six-pointed-star.svg',
  '/vector/generic/8472.svg': '/vector/generic/species-8472.svg',
  '/vector/generic/8point.svg': '/vector/generic/eight-pointed-burst.svg',
  '/vector/generic/argos.svg': '/vector/generic/galactic-alliance.svg',
  '/vector/generic/arrowbox.svg': '/vector/generic/sith-empire-hexagon.svg',
  '/vector/generic/atreiblock.svg': '/vector/generic/house-atreides.svg',
  '/vector/generic/balance.svg': '/vector/generic/yin-yang.svg',
  '/vector/generic/barge.svg': '/vector/generic/mantis-cruiser.svg',
  '/vector/generic/biggle.svg': '/vector/generic/double-axe-circle.svg',
  '/vector/generic/birdban.svg': '/vector/generic/bird-banner.svg',
  '/vector/generic/blad.svg': '/vector/generic/hooked-oval-crest.svg',
  '/vector/generic/bluks.svg': '/vector/generic/united-earth-federation.svg',
  '/vector/generic/broke.svg': '/vector/generic/cracked-v.svg',
  '/vector/generic/bug.svg': '/vector/generic/scarab.svg',
  '/vector/generic/bull.svg': '/vector/generic/ram-skull.svg',
  '/vector/generic/ceasar.svg': '/vector/generic/laurel-star.svg',
  '/vector/generic/chaom.svg': '/vector/generic/choam.svg',
  '/vector/generic/corrino.svg': '/vector/generic/corrino-helmet.svg',
  '/vector/generic/cpu.svg': '/vector/generic/rounded-microchip.svg',
  '/vector/generic/crift.svg': '/vector/generic/pointed-crystal-crest.svg',
  '/vector/generic/crosstripes.svg': '/vector/generic/cross-stripes.svg',
  '/vector/generic/cyclo.svg': '/vector/generic/spiral-wave.svg',
  '/vector/generic/da7.svg': '/vector/generic/aquos.svg',
  '/vector/generic/def.svg': '/vector/generic/unsc-army.svg',
  '/vector/generic/dello.svg': '/vector/generic/teardrop-spiral.svg',
  '/vector/generic/denobula.svg': '/vector/generic/denobulan.svg',
  '/vector/generic/deteis.svg': '/vector/generic/deteis-bloodline.svg',
  '/vector/generic/dp.svg': '/vector/generic/dude-perfect.svg',
  '/vector/generic/effect.svg': '/vector/generic/asari-republics.svg',
  '/vector/generic/elaurian.svg': '/vector/generic/el-aurian.svg',
  '/vector/generic/emiron.svg': '/vector/generic/cronus.svg',
  '/vector/generic/emperiskull.svg': '/vector/generic/house-corrino.svg',
  '/vector/generic/encircl.svg': '/vector/generic/ring-of-stars.svg',
  '/vector/generic/entor.svg': '/vector/generic/ankh-of-the-triarch.svg',
  '/vector/generic/federation.svg': '/vector/generic/united-federation-of-planets.svg',
  '/vector/generic/ferengi.svg': '/vector/generic/ferengi-alliance.svg',
  '/vector/generic/fishspeekers.svg': '/vector/generic/fish-speakers.svg',
  '/vector/generic/flauqre.svg': '/vector/generic/great-house-emblem.svg',
  '/vector/generic/force.svg': '/vector/generic/millikans-reach-terran-empire.svg',
  '/vector/generic/fremball.svg': '/vector/generic/fremen.svg',
  '/vector/generic/gdi1.svg': '/vector/generic/gdi-eagle-roundel.svg',
  '/vector/generic/gdi2.svg': '/vector/generic/gdi-lightning-eagle.svg',
  '/vector/generic/gdi3.svg': '/vector/generic/gdi-eagle-head.svg',
  '/vector/generic/gdi4.svg': '/vector/generic/gdi-eagle-disc.svg',
  '/vector/generic/gdi6.svg': '/vector/generic/global-defense-initiative.svg',
  '/vector/generic/gearos.svg': '/vector/generic/source-filmmaker.svg',
  '/vector/generic/goededag.svg': '/vector/generic/crossed-maces.svg',
  '/vector/generic/gring.svg': '/vector/generic/tau-sept.svg',
  '/vector/generic/guildeyes.svg': '/vector/generic/guild-eyes.svg',
  '/vector/generic/hammer.svg': '/vector/generic/hammers.svg',
  '/vector/generic/harkoring.svg': '/vector/generic/house-harkonnen.svg',
  '/vector/generic/here.svg': '/vector/generic/electrostatic-warning.svg',
  '/vector/generic/hexes.svg': '/vector/generic/the-forgotten.svg',
  '/vector/generic/hurus.svg': '/vector/generic/eye-of-horus.svg',
  '/vector/generic/infiniguild.svg': '/vector/generic/spacing-guild.svg',
  '/vector/generic/info.svg': '/vector/generic/tau-empire.svg',
  '/vector/generic/inter.svg': '/vector/generic/aeldari.svg',
  '/vector/generic/jarje.svg': '/vector/generic/spear-in-ring.svg',
  '/vector/generic/keys.svg': '/vector/generic/atlan-system-federation.svg',
  '/vector/generic/klingon.svg': '/vector/generic/klingon-empire.svg',
  '/vector/generic/krenim.svg': '/vector/generic/krenim-imperium.svg',
  '/vector/generic/laser.svg': '/vector/generic/laser-warning.svg',
  '/vector/generic/lifting.svg': '/vector/generic/tilted-rings.svg',
  '/vector/generic/lishen.svg': '/vector/generic/quarian-migrant-fleet.svg',
  '/vector/generic/llc1.svg': '/vector/generic/shooting-star-ring.svg',
  '/vector/generic/llc10.svg': '/vector/generic/flame-crest.svg',
  '/vector/generic/llc11.svg': '/vector/generic/triple-lobe-flame.svg',
  '/vector/generic/llc12.svg': '/vector/generic/tree-crest.svg',
  '/vector/generic/llc13.svg': '/vector/generic/three-blade-swirl.svg',
  '/vector/generic/llc2.svg': '/vector/generic/rays-across-disc.svg',
  '/vector/generic/llc4.svg': '/vector/generic/starburst-ring.svg',
  '/vector/generic/llc5.svg': '/vector/generic/three-spoked-star.svg',
  '/vector/generic/llc6.svg': '/vector/generic/square-knot.svg',
  '/vector/generic/llc7.svg': '/vector/generic/spiral-diamond.svg',
  '/vector/generic/llc8.svg': '/vector/generic/fleur-de-lis.svg',
  '/vector/generic/llc9.svg': '/vector/generic/angular-compass-star.svg',
  '/vector/generic/magnet.svg': '/vector/generic/combine.svg',
  '/vector/generic/matres.svg': '/vector/generic/honored-matres.svg',
  '/vector/generic/microblock.svg': '/vector/generic/hexagon-maze.svg',
  '/vector/generic/moritani.svg': '/vector/generic/house-moritani.svg',
  '/vector/generic/mortal.svg': '/vector/generic/draconis-combine.svg',
  '/vector/generic/mural1.svg': '/vector/generic/compass-rose.svg',
  '/vector/generic/mural2.svg': '/vector/generic/woven-rosette.svg',
  '/vector/generic/mural3.svg': '/vector/generic/radial-starburst.svg',
  '/vector/generic/mural4.svg': '/vector/generic/eight-petal-flower.svg',
  '/vector/generic/nightsky.svg': '/vector/generic/night-sky.svg',
  '/vector/generic/nuke.svg': '/vector/generic/radiation.svg',
  '/vector/generic/ocro.svg': '/vector/generic/dune-band-logo.svg',
  '/vector/generic/orbsword.svg': '/vector/generic/sword-and-atom.svg',
  '/vector/generic/outcast.svg': '/vector/generic/brotherhood-outcasts.svg',
  '/vector/generic/petala.svg': '/vector/generic/petal-ring.svg',
  '/vector/generic/petalb.svg': '/vector/generic/toothed-petal-ring.svg',
  '/vector/generic/petalfan.svg': '/vector/generic/lotus.svg',
  '/vector/generic/petorbid.svg': '/vector/generic/pointed-leaf.svg',
  '/vector/generic/pickup.svg': '/vector/generic/hot-surface.svg',
  '/vector/generic/psycorp.svg': '/vector/generic/octagon-cross.svg',
  '/vector/generic/quizarate.svg': '/vector/generic/qizarate.svg',
  '/vector/generic/rebels.svg': '/vector/generic/galactic-republic.svg',
  '/vector/generic/richese.svg': '/vector/generic/lamp-of-knowledge.svg',
  '/vector/generic/risa.svg': '/vector/generic/risian.svg',
  '/vector/generic/romulan.svg': '/vector/generic/romulan-republic.svg',
  '/vector/generic/saudarkar.svg': '/vector/generic/sardaukar.svg',
  '/vector/generic/sca.svg': '/vector/generic/ornate-spearhead.svg',
  '/vector/generic/schema.svg': '/vector/generic/angular-sunburst.svg',
  '/vector/generic/shade.svg': '/vector/generic/sith-order.svg',
  '/vector/generic/shar.svg': '/vector/generic/redwake.svg',
  '/vector/generic/sharky.svg': '/vector/generic/tyranids.svg',
  '/vector/generic/sheddle.svg': '/vector/generic/heraldic-eagle.svg',
  '/vector/generic/shell.svg': '/vector/generic/minmatar-republic.svg',
  '/vector/generic/sherl.svg': '/vector/generic/spiral-shell.svg',
  '/vector/generic/shiegle.svg': '/vector/generic/winged-star-eagle.svg',
  '/vector/generic/shim.svg': '/vector/generic/hierarchy.svg',
  '/vector/generic/sith.svg': '/vector/generic/sith-empire-sunburst.svg',
  '/vector/generic/slange.svg': '/vector/generic/geth.svg',
  '/vector/generic/slechtedag.svg': '/vector/generic/crossed-morning-stars.svg',
  '/vector/generic/soviet.svg': '/vector/generic/sword-and-sickle.svg',
  '/vector/generic/spiderette.svg': '/vector/generic/bene-gesserit.svg',
  '/vector/generic/spycore.svg': '/vector/generic/segmented-cross.svg',
  '/vector/generic/squidle.svg': '/vector/generic/bird-of-prey-head.svg',
  '/vector/generic/stackle.svg': '/vector/generic/star-and-chevrons.svg',
  '/vector/generic/staergle.svg': '/vector/generic/eagle-star-insignia.svg',
  '/vector/generic/starase.svg': '/vector/generic/sun-banner.svg',
  '/vector/generic/startag.svg': '/vector/generic/star-badge.svg',
  '/vector/generic/swave.svg': '/vector/generic/curved-wave.svg',
  '/vector/generic/swordrock.svg': '/vector/generic/sword-in-rock.svg',
  '/vector/generic/tan.svg': '/vector/generic/branching-circle.svg',
  '/vector/generic/tantor.svg': '/vector/generic/bull-head.svg',
  '/vector/generic/tecky.svg': '/vector/generic/mark-of-khorne.svg',
  '/vector/generic/tellerite.svg': '/vector/generic/tellarite.svg',
  '/vector/generic/terran.svg': '/vector/generic/terran-empire.svg',
  '/vector/generic/torp.svg': '/vector/generic/sword-in-circle.svg',
  '/vector/generic/trian.svg': '/vector/generic/triple-triangle.svg',
  '/vector/generic/trimanos.svg': '/vector/generic/triangular-knot.svg',
  '/vector/generic/trispear.svg': '/vector/generic/three-crossed-spears.svg',
  '/vector/generic/triswords.svg': '/vector/generic/three-crossed-swords.svg',
  '/vector/generic/tritant.svg': '/vector/generic/trident.svg',
  '/vector/generic/trix.svg': '/vector/generic/arrowhead-triangle.svg',
  '/vector/generic/vaudaur.svg': '/vector/generic/vaadwaur.svg',
  '/vector/generic/ve.svg': '/vector/generic/striped-v.svg',
  '/vector/generic/vernius.svg': '/vector/generic/house-vernius.svg',
  '/vector/generic/viode.svg': '/vector/generic/inverted-triangle.svg',
  '/vector/generic/vp.svg': '/vector/generic/star-in-ring.svg',
  '/vector/generic/vulcan.svg': '/vector/generic/vulcan-idic.svg',
  '/vector/generic/waiku.svg': '/vector/generic/stepped-cross.svg',
  '/vector/generic/why.svg': '/vector/generic/winged-oval-symbol.svg',
  '/vector/generic/wuurm.svg': '/vector/generic/sandworm.svg',
  '/vector/generic/zap.svg': '/vector/generic/electric-shock.svg',
};

export const canonicalVectorArtwork = (path: string): string =>
  Object.hasOwn(VECTOR_ARTWORK_ALIASES, path) ? VECTOR_ARTWORK_ALIASES[path] : path;
/** Stamp the authoring tool writes on processed sources; verify warns (later: fails) without it. */
export const VECTOR_AUTHORED_ATTRIBUTE = 'data-authored';

type VectorPaintPolicy = 'inherit' | 'baked-when-multicolor';

export type VectorCategoryRule = {
  paint: VectorPaintPolicy;
  /** Preserve internal ids and group structure (fragment-id API files). */
  fragmentApi: boolean;
  /** Generate committed .obj game pieces from this category (TTS use, #309). */
  obj: boolean;
};

export const VECTOR_CATEGORY_RULES = {
  background: { paint: 'baked-when-multicolor', fragmentApi: true, obj: false },
  decal: { paint: 'baked-when-multicolor', fragmentApi: false, obj: false },
  generic: { paint: 'inherit', fragmentApi: false, obj: false },
  icon: { paint: 'baked-when-multicolor', fragmentApi: false, obj: false },
  emblem: { paint: 'inherit', fragmentApi: false, obj: true },
  troop: { paint: 'inherit', fragmentApi: false, obj: true },
  // Fragment API: consumers paint #outline and #star separately (the old two-tone look).
  troop_modifier: { paint: 'inherit', fragmentApi: true, obj: true },
} as const satisfies Record<string, VectorCategoryRule>;

export type VectorCategory = keyof typeof VECTOR_CATEGORY_RULES;

const MULTICOLOR_SUFFIX = '-multicolor';

/**
 * The map's place-id API (`/vector/background/map.svg#<id>`), consumed by Spice.tsx and the rules pages.
 * The build fails if optimization drops any of these (#296 guard 5).
 */
export const MAP_PLACE_IDS = [
  'arrakeen',
  'arsunt',
  'basin',
  'bight-of-the-cliff',
  'broken-land',
  'carthag',
  'cielago-depression',
  'cielago-east',
  'cielago-north',
  'cielago-south',
  'cielago-west',
  'false-wall-east',
  'false-wall-south',
  'false-wall-west',
  'funeral-plain',
  'gara-kulon',
  'habbanya',
  'habbanya-erg',
  'habbanya-ridge-flat',
  'hagga-basin',
  'harg-pass',
  'hole-in-the-rock',
  'icons',
  'imperial-basin',
  'meridian',
  'old-gap',
  'pasty-mesa',
  'plastic-basin',
  'polar',
  'red-chasm',
  'rim-wall-west',
  'rock',
  'rock-outcroppings',
  'sand',
  'sectors',
  'shield-wall',
  'sihaya-ridge',
  'south-mesa',
  'strongholds',
  'tabr',
  'the-great-flat',
  'the-greater-flat',
  'the-minor-erg',
  'tsimpo',
  'tueks',
  'wind-pass',
  'wind-pass-north',
] as const;

/** Whether a file in a `baked-when-multicolor` category is allowed to carry baked paint. */
export function allowsBakedPaint(category: VectorCategory, fileName: string): boolean {
  const rule = VECTOR_CATEGORY_RULES[category];
  if (rule.paint === 'inherit') {
    return false;
  }
  if (category === 'background' || category === 'icon') {
    return true;
  }
  return fileName.replace(/\.svg$/, '').endsWith(MULTICOLOR_SUFFIX);
}

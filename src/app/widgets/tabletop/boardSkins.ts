import { gameAssetColors, rendererColors } from '@shared/play/assetColors';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { Color, NoBlending } from 'three';
import type { Texture } from 'three';
import {
  abs,
  cos,
  floor,
  fract,
  mix,
  mx_cell_noise_float,
  step,
  distance,
  dot,
  float,
  luminance,
  materialColor,
  max,
  min,
  mx_fractal_noise_float,
  mx_worley_noise_vec2,
  normalize,
  positionLocal,
  sin,
  transformNormalToView,
  smoothstep,
  texture,
  vec2,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';

/*
 * Board skins: a viewer's own look for the map's territory types, drawn by the board's material alone.
 * A skin shades the colour each territory already has, lighter or darker, and raises a relief the table's lights pick out;
 * it adds no hue of its own, and dark ink (borders, decals) stays flat and keeps its contrast.
 */

export const BOARD_SKINS = ['none', 'gf9', 'fancy', 'treachery'] as const;
export type BoardSkin = (typeof BOARD_SKINS)[number];

export const BOARD_SKIN_LABELS: Record<BoardSkin, string> = {
  none: 'None',
  gf9: 'GF9',
  fancy: 'Fancy',
  treachery: 'Treachery Online',
};

type F = Node<'float'>;
type V2 = Node<'vec2'>;

/* The territory type colours, in the same working space as the geometry's vertex colours. */
const TYPE_COLORS = {
  sand: new Color(gameAssetColors.mapSand),
  rock: new Color(gameAssetColors.mapRock),
  stronghold: new Color(gameAssetColors.mapStronghold),
  polar: new Color(rendererColors.white),
};

/** 1 inside a territory whose vertex colour is the type's own colour, 0 elsewhere (legacy decals and ink keep their look). */
function typeWeight(color: Color): F {
  return float(1).sub(smoothstep(0.01, 0.03, distance(vertexColor(0).rgb, vec3(color.r, color.g, color.b))));
}

/* Patterns over the board plane, in board units (the board's radius is about 4). */
const fbm = (p: V2, octaves: number): F => mx_fractal_noise_float(p, octaves, 2, 0.5);
const warp = (p: V2, scale: number, amount: number): V2 =>
  p.add(vec2(fbm(p.mul(scale), 3), fbm(p.mul(scale).add(vec2(5.2, 1.3)), 3)).mul(amount));
/** Distance to the nearest cell edge of a Worley pattern: 0 on the edge. */
const cellEdge = (p: V2, jitter: number): F => {
  const cells = mx_worley_noise_vec2(p, jitter);
  return cells.y.sub(cells.x);
};

/** A skin's look at one point: brightness (1 is the board's own colour) and a height in board units. */
type Surface = Readonly<{ shade: F; height: F }>;
type Layer = Readonly<{ sand: Surface; rock: Surface; stronghold: Surface; polar: Surface }>;

/** Where a pattern is evaluated: the board plane, and how far that point lies from a terrain-type border and from any territory border (0..1 of EDGE_FIELD_REACH). */
type Site = Readonly<{ p: V2; typeEdge: F; territoryEdge: F }>;

/** GF9's printed board: stone-grained parchment, mottled grit and stains, each territory darkening toward its borders. */
function gf9({ p, territoryEdge }: Site): Layer {
  const mottle = fbm(warp(p, 0.8, 0.9).mul(2.6), 5);
  const grain = fbm(p.mul(90), 2);
  const fleck = smoothstep(0.35, 0.75, fbm(p.mul(38).add(vec2(4, 9)), 3));
  const veins = float(1).sub(smoothstep(0, 0.06, abs(fbm(warp(p, 1.1, 0.5).mul(1.4), 4))));
  const stain = smoothstep(0, 0.7, fbm(p.mul(0.8).add(vec2(9, 3)), 3));
  /* Inked edges: the paint pools and darkens along every border. */
  const pooled = float(1).sub(smoothstep(0, 0.45, territoryEdge));
  const paper = (strength: number, edge: number) =>
    float(1)
      .add(mottle.mul(0.3 * strength))
      .add(grain.mul(0.12 * strength))
      .sub(fleck.mul(0.18 * strength))
      .sub(veins.mul(0.12 * strength))
      .sub(stain.mul(0.2 * strength))
      .sub(pooled.mul(edge));
  const grit = grain.mul(0.0015).add(mottle.mul(0.002));
  return {
    sand: { shade: paper(1, 0.22), height: grit },
    rock: { shade: paper(1.2, 0.35), height: grit },
    stronghold: { shade: paper(0.9, 0.4), height: grit },
    polar: { shade: paper(0.4, 0.18), height: float(0) },
  };
}

/* Long dunes with sharp crests and small ripples, settling flat where the sand meets another terrain. */
function fancySand({ p, typeEdge }: Site): Surface {
  const bent = warp(p, 0.7, 0.7);
  const across = dot(bent, vec2(0.83, 0.56));
  const dune = float(1)
    .sub(abs(sin(across.mul(9))))
    .pow(1.5);
  const ripple = sin(dot(warp(p, 2.5, 0.12), vec2(0.6, 0.8)).mul(70))
    .mul(0.5)
    .add(0.5);
  const open = smoothstep(0.02, 0.35, typeEdge);
  /* Scree: stones shed from the cliffs lie on the sand at their foot. */
  const scree = smoothstep(0.25, 0.7, fbm(p.mul(48), 3)).mul(float(1).sub(smoothstep(0, 0.3, typeEdge)));
  const sandHeight = dune.mul(0.04).add(ripple.mul(0.003)).mul(open).add(scree.mul(0.004));
  return {
    shade: float(0.82).add(dune.mul(0.26).mul(open)).add(ripple.mul(0.05)).sub(scree.mul(0.25)),
    height: sandHeight,
  };
}

/*
 * Rock steps up from the sand in a low cliff onto a rough plateau. Ranges of sharp ridges wander along just inside
 * its edges, their crests throwing spurs and gullies down both flanks; the widest plateaus carry a range inland too.
 */
function fancyRock({ p, typeEdge }: Site): Surface {
  const cliff = smoothstep(0, 0.06, typeEdge);
  const spineAt = fbm(p.mul(1.2), 2).mul(0.15).add(0.28);
  const range = max(
    float(1).sub(smoothstep(0, 0.45, abs(typeEdge.sub(spineAt)))),
    smoothstep(0.5, 0.9, typeEdge).mul(smoothstep(-0.2, 0.3, fbm(p.mul(0.9).add(vec2(7, 1)), 2)))
  ).mul(smoothstep(0.02, 0.1, typeEdge));
  /* Fractal noise can pass 1, so the ridges are clamped before the powers below (a negative base is NaN). */
  const crest = float(1)
    .sub(abs(fbm(warp(p, 1.5, 0.2).mul(3.2), 5)))
    .max(0);
  const spurs = float(1)
    .sub(abs(fbm(warp(p, 4, 0.05).mul(9), 3)))
    .max(0);
  const peaks = range.pow(1.3).mul(crest.pow(2.5).mul(0.75).add(spurs.pow(3).mul(0.25)));
  const rough = fbm(p.mul(30), 2);
  const rockHeight = cliff.mul(0.025).add(peaks.mul(0.14)).add(rough.mul(0.002));
  return {
    shade: float(0.66).add(peaks.mul(0.35)).add(rough.mul(0.05)).sub(float(1).sub(cliff).mul(0.15)),
    height: rockHeight,
  };
}

/** The town's lots: each cell of a grid turned per quarter, split once across and once along at random. */
function townLots(p: V2) {
  const quarter = mx_cell_noise_float(floor(p.mul(2.5)))
    .mul(1.4)
    .sub(0.7);
  const town = warp(p, 3, 0.03);
  const streets = vec2(
    town.x.mul(cos(quarter)).sub(town.y.mul(sin(quarter))),
    town.x.mul(sin(quarter)).add(town.y.mul(cos(quarter)))
  ).mul(9);
  const lot = floor(streets);
  const within = fract(streets);
  const splitX = mx_cell_noise_float(lot).mul(0.4).add(0.3);
  const east = step(splitX, within.x);
  const splitY = mx_cell_noise_float(lot.add(vec2(east.mul(17), 3)))
    .mul(0.4)
    .add(0.3);
  const north = step(splitY, within.y);
  const left = splitX.mul(east);
  const right = mix(splitX, float(1), east);
  const bottom = splitY.mul(north);
  const top = mix(splitY, float(1), north);
  return {
    within,
    /* How far into its lot a point lies from the nearest lane, in cells. */
    fromLane: min(min(within.x.sub(left), right.sub(within.x)), min(within.y.sub(bottom), top.sub(within.y))),
    /* A random number per lot. */
    plot: mx_cell_noise_float(lot.add(vec2(east.mul(17), north.mul(29).add(5)))),
    centre: vec2(left.add(right).mul(0.5), bottom.add(top).mul(0.5)),
    reach: min(right.sub(left), top.sub(bottom)).mul(0.4),
  };
}

/*
 * A stronghold is a walled old town: its painted band stands as the wall, and inside it lie rectangular blocks
 * of every size, each grid cell split once across and once along at random, packed along crooked lanes.
 * Each quarter of the town turns its streets its own way and a few winding avenues cut through, so it never reads as a grid.
 */
function fancyCity({ p, territoryEdge }: Site): Surface {
  const bevel = smoothstep(0, 0.06, territoryEdge);
  const wall = smoothstep(0.04, 0.08, territoryEdge).mul(float(1).sub(smoothstep(0.27, 0.33, territoryEdge)));
  const inside = smoothstep(0.27, 0.32, territoryEdge);
  const { within, fromLane, plot, centre, reach } = townLots(p);
  const avenue = float(1).sub(smoothstep(0.012, 0.03, abs(fbm(p.mul(1.6).add(vec2(2, 5)), 2))));
  /*
   * Desert houses: flat-roofed boxes of mud brick with a low parapet, a courtyard sunk into the larger ones,
   * the odd domed tower, and here and there an open square. Steep walls let the table's light cast their shadows.
   */
  const ground = float(1).sub(avenue).mul(inside);
  const house = smoothstep(0.08, 0.1, fromLane).mul(step(0.08, plot)).mul(ground);
  const storeys = plot.mul(0.016).add(0.008);
  const parapet = smoothstep(0.1, 0.11, fromLane).sub(smoothstep(0.13, 0.14, fromLane));
  const courtyard = step(0.55, plot)
    .mul(step(plot, 0.75))
    .mul(smoothstep(0.2, 0.22, fromLane));
  const fromCentre = distance(within, centre).div(reach);
  const dome = step(0.92, plot).mul(
    float(1)
      .sub(min(fromCentre.mul(fromCentre), float(1)))
      .sqrt()
  );
  const city = house
    .mul(storeys.add(parapet.mul(0.003)).sub(courtyard.mul(storeys).mul(0.8)))
    .add(dome.mul(0.02).mul(ground));
  const cityHeight = bevel.mul(0.012).add(wall.mul(0.01)).add(city);
  return {
    shade: float(0.62)
      .add(bevel.mul(0.12))
      .add(wall.mul(0.18))
      .add(house.mul(plot.mul(0.16).add(0.1)).sub(courtyard.mul(house).mul(0.1)).sub(inside.mul(0.14))),
    height: cityHeight,
  };
}

/* The Polar Sink lies a little lower than its shore, its ice broken into plates. */
function fancyIce({ p, territoryEdge }: Site): Surface {
  const ice = smoothstep(0, 0.07, cellEdge(warp(p, 2, 0.1).mul(10), 1));
  const sunk = smoothstep(0, 0.3, territoryEdge);
  return { shade: float(0.84).add(ice.mul(0.16)), height: ice.mul(0.003).sub(sunk.mul(0.012)) };
}

/** A painted relief map: dunes that settle against the rock, rock plateaus behind ridged cliffs, desert towns and a sunken sheet of cracked ice. */
function fancy(site: Site): Layer {
  return { sand: fancySand(site), rock: fancyRock(site), stronghold: fancyCity(site), polar: fancyIce(site) };
}

/** The map treachery.online draws: SVG turbulence lit by a distant light, pillowy lumps over the sand and broad crags over the rock. */
function treachery({ p, typeEdge }: Site): Layer {
  /* Turbulence is the sum of absolute noise, so it rises in rounded lumps with creases between them. */
  const lumps = abs(fbm(p.mul(3.6), 1)).mul(2);
  const crag = fbm(p.mul(1.4), 6).add(fbm(p.mul(7), 4).mul(0.3));
  const settle = smoothstep(0, 0.1, typeEdge);
  return {
    sand: { shade: float(0.9).add(lumps.mul(0.22)), height: lumps.mul(0.03) },
    rock: { shade: float(0.95).add(crag.mul(0.3)), height: crag.mul(0.1).mul(settle) },
    stronghold: { shade: float(0.95).add(crag.mul(0.15)), height: crag.mul(0.05).mul(settle) },
    polar: { shade: float(0.95).add(lumps.mul(0.08)), height: lumps.mul(0.008) },
  };
}

const LAYERS: Record<Exclude<BoardSkin, 'none'>, (site: Site) => Layer> = { gf9, fancy, treachery };

/** How the bake writes what it computed: shading over two (so 1 is mid-grey), and the tilted normal's x and z around a half. */
const SHADE_RANGE = 2;

export type BoardBakeOptions = Readonly<{
  /** The board artwork, so the bake can leave dark ink alone; null where the paint is the vertex colours. */
  map: Texture | null;
  /** The board's edge field (boardEdgeField), or null where the board has no definition to draw it from. */
  edges: Texture | null;
}>;

/**
 * The skin's patterns, drawn once over the board plane into a texture (see bakeBoardSkin).
 * The bake draws the board's own geometry from straight above, so each pixel holds its spot on the board.
 */
export function createBoardBakeMaterial(skin: Exclude<BoardSkin, 'none'>, options: BoardBakeOptions) {
  const material = new MeshBasicNodeMaterial({
    map: options.map,
    depthTest: false,
    depthWrite: false,
  });
  material.toneMapped = false;
  material.blending = NoBlending;
  const p = positionLocal.xz;

  const base = options.map ? materialColor.rgb : vertexColor(0).rgb;
  /* Dark ink (borders, numerals, decals) stays flat and keeps its contrast. */
  const keep = smoothstep(0.03, 0.1, luminance(base));
  const edges = options.edges;
  const siteAt = (offset: V2 | null): Site => {
    const at = offset ? p.add(offset) : p;
    const field = edges ? texture(edges, at.div(BOARD_RADIUS * 2).add(0.5)) : null;
    return { p: at, typeEdge: field ? field.r : float(1), territoryEdge: field ? field.g : float(1) };
  };
  const weights = [
    typeWeight(TYPE_COLORS.sand),
    typeWeight(TYPE_COLORS.rock),
    typeWeight(TYPE_COLORS.stronghold),
    typeWeight(TYPE_COLORS.polar),
  ];
  const combine = (layer: Layer, pick: (surface: Surface) => F, rest: number) => {
    let total: F = float(rest);
    [layer.sand, layer.rock, layer.stronghold, layer.polar].forEach((surface, index) => {
      total = total.add(pick(surface).sub(rest).mul(weights[index]));
    });
    return total;
  };
  const layer = LAYERS[skin](siteAt(null));
  const shade = float(1).add(
    combine(layer, (surface) => surface.shade, 1)
      .sub(1)
      .mul(keep)
  );
  const height = combine(layer, (surface) => surface.height, 0);

  /* Finite differences over the plane tilt the normal, so the table's own lights model the relief. */
  const step = 0.006;
  const heightAt = (offset: V2) => combine(LAYERS[skin](siteAt(offset)), (surface) => surface.height, 0);
  const tilt = keep.div(step);
  const dx = heightAt(vec2(step, 0)).sub(height).mul(tilt);
  const dz = heightAt(vec2(0, step)).sub(height).mul(tilt);
  const normal = normalize(vec3(dx.negate(), 1, dz.negate()));
  /* Shadows the table's key light (high to the left and toward the viewer) casts from ridges, walls and houses. */
  const toLight = vec2(-0.62, 0.78);
  const shadow = smoothstep(0.003, 0.015, heightAt(toLight.mul(0.02)).sub(height)).mul(keep);
  material.colorNode = vec4(
    shade.mul(float(1).sub(shadow.mul(0.4))).div(SHADE_RANGE),
    normal.x.mul(0.5).add(0.5),
    normal.z.mul(0.5).add(0.5),
    1
  );
  return material;
}

export type BoardPaintOptions = Readonly<{
  /** True for the legacy map, whose shapes carry colour and alpha per vertex. */
  vertexColors: boolean;
  polygonOffset: boolean;
  map: Texture | null;
  /** The skin baked for this board (bakeBoardSkin), or null to draw the board's own look while it bakes. */
  baked: Texture | null;
  /** Shade the board like a lit planet: bright in the middle, darkening toward the rim. */
  planet: boolean;
}>;

/**
 * The board paint's material: the board's own look, its baked skin and planet shading.
 * Every frame it reads the baked texture once;
 * the patterns themselves ran once, in the bake.
 */
export function createBoardPaintMaterial(options: BoardPaintOptions) {
  const material = new MeshStandardNodeMaterial({
    transparent: true,
    depthWrite: false,
    roughness: 0.88,
    metalness: 0,
    vertexColors: options.vertexColors,
    polygonOffset: options.polygonOffset,
    polygonOffsetFactor: options.polygonOffset ? -1 : 0,
    polygonOffsetUnits: options.polygonOffset ? -1 : 0,
    map: options.map,
  });
  if (!options.baked && !options.planet) {
    return material;
  }
  const p = positionLocal.xz;
  let color = materialColor.rgb;
  if (options.planet) {
    /* The board's disc lit like a sphere, its limb darkening toward the rim. */
    const facing = float(1)
      .sub(min(dot(p, p).div(BOARD_RADIUS * BOARD_RADIUS), float(1)))
      .sqrt();
    color = color.mul(float(0.25).add(facing.pow(0.9).mul(0.85)));
  }
  if (options.baked) {
    const baked = texture(options.baked, vec2(p.x.div(BOARD_RADIUS * 2).add(0.5), p.y.div(BOARD_RADIUS * 2).add(0.5)));
    color = color.mul(baked.r.mul(SHADE_RANGE));
    const nx = baked.g.mul(2).sub(1);
    const nz = baked.b.mul(2).sub(1);
    const ny = float(1).sub(nx.mul(nx)).sub(nz.mul(nz)).max(0).sqrt();
    material.normalNode = transformNormalToView(normalize(vec3(nx, ny, nz)));
  }
  material.colorNode = color;
  return material;
}

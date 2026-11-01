import { gameAssetColors, rendererColors } from '@shared/play/assetColors';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { Color } from 'three';
import type { Texture } from 'three';
import {
  abs,
  distance,
  dot,
  float,
  floor,
  fract,
  luminance,
  materialColor,
  max,
  min,
  mx_cell_noise_float,
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
  vertexColor,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { MeshStandardNodeMaterial } from 'three/webgpu';

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

/** A painted relief map: dunes that settle against the rock, rock plateaus behind lit cliffs, walled cities and a sunken sheet of cracked ice. */
function fancy({ p, typeEdge, territoryEdge }: Site): Layer {
  const bent = warp(p, 0.7, 0.7);
  const across = dot(bent, vec2(0.83, 0.56));
  /* Long dunes with sharp crests and small ripples over them; both settle flat where the sand meets another terrain. */
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

  /* Rock rises in a cliff from its border onto a plateau of ridged mountains. */
  const plateau = smoothstep(0, 0.08, typeEdge);
  const ridged = float(1).sub(abs(fbm(warp(p, 1.3, 0.3).mul(3.4), 4)));
  const mountains = ridged
    .mul(ridged)
    .mul(ridged)
    .mul(smoothstep(0.05, 0.5, typeEdge));
  const rockHeight = plateau.mul(0.06).add(mountains.mul(0.06));

  /* A stronghold: a wall just inside its border around blocks of the city. */
  const wall = smoothstep(0.015, 0.035, territoryEdge).mul(float(1).sub(smoothstep(0.06, 0.09, territoryEdge)));
  const inside = smoothstep(0.09, 0.12, territoryEdge);
  const grid = vec2(dot(p, vec2(0.94, 0.34)), dot(p, vec2(-0.34, 0.94))).mul(36);
  const street = min(min(fract(grid.x), fract(grid.y)), float(1).sub(max(fract(grid.x), fract(grid.y))));
  const block = mx_cell_noise_float(floor(grid));
  const built = smoothstep(0.05, 0.14, street).mul(inside);
  const cityHeight = wall.mul(0.016).add(built.mul(block.mul(0.6).add(0.4)).mul(0.009));

  /* The Polar Sink lies a little lower than its shore, its ice broken into plates. */
  const ice = smoothstep(0, 0.07, cellEdge(warp(p, 2, 0.1).mul(10), 1));
  const sunk = smoothstep(0, 0.3, territoryEdge);
  return {
    sand: {
      shade: float(0.82).add(dune.mul(0.26).mul(open)).add(ripple.mul(0.05)).sub(scree.mul(0.25)),
      height: sandHeight,
    },
    rock: {
      shade: float(0.68)
        .add(mountains.mul(0.5))
        .add(fbm(p.mul(40), 2).mul(0.06))
        .sub(float(1).sub(plateau).mul(0.12)),
      height: rockHeight,
    },
    stronghold: {
      shade: float(0.78)
        .add(wall.mul(0.25))
        .add(built.mul(block.mul(0.25))),
      height: cityHeight,
    },
    polar: { shade: float(0.84).add(ice.mul(0.16)), height: ice.mul(0.003).sub(sunk.mul(0.012)) },
  };
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

export type BoardSkinMaterialOptions = Readonly<{
  /** True for the legacy map, whose shapes carry colour and alpha per vertex. */
  vertexColors: boolean;
  polygonOffset: boolean;
  map: Texture | null;
  /** The board's edge field (boardEdgeField), or null where the board has no definition to draw it from. */
  edges: Texture | null;
  /** Shade the board like a lit planet: bright in the middle, darkening toward the rim. */
  planet: boolean;
}>;

/** The board paint's material for one skin; `none` without planet shading is exactly the board's own look. */
export function createBoardSkinMaterial(skin: BoardSkin, options: BoardSkinMaterialOptions) {
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
  if (skin === 'none' && !options.planet) {
    return material;
  }
  const p = positionLocal.xz;
  /* The board's own colour: its artwork, or the territory colours while the artwork loads. */
  const base = materialColor.rgb;
  /* Dark ink (borders, numerals, decals) stays flat and keeps its contrast. */
  const keep = smoothstep(0.03, 0.1, luminance(base));
  /* Planet shading: the board's disc lit like a sphere, its limb darkening toward the rim. */
  const facing = float(1)
    .sub(min(dot(p, p).div(BOARD_RADIUS * BOARD_RADIUS), float(1)))
    .sqrt();
  const limb = options.planet ? float(0.25).add(facing.pow(0.9).mul(0.85)) : float(1);
  if (skin === 'none') {
    material.colorNode = base.mul(limb);
    return material;
  }

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
  const shade = combine(layer, (surface) => surface.shade, 1);
  const height = combine(layer, (surface) => surface.height, 0);
  material.colorNode = base.mul(float(1).add(shade.sub(1).mul(keep))).mul(limb);

  /* Finite differences over the plane tilt the normal, so the table's own lights model the relief. */
  const step = 0.006;
  const heightAt = (offset: V2) => combine(LAYERS[skin](siteAt(offset)), (surface) => surface.height, 0);
  const tilt = keep.div(step);
  const dx = heightAt(vec2(step, 0)).sub(height).mul(tilt);
  const dz = heightAt(vec2(0, step)).sub(height).mul(tilt);
  material.normalNode = transformNormalToView(normalize(vec3(dx.negate(), 1, dz.negate())));
  return material;
}

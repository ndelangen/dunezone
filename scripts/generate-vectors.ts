/**
 * Media/vector/** → public/vector/** generator (wayfinder #294, train ticket #306).
 *
 * For every source: bake the normalization into coordinates (src/shared/vectorNormalize.ts), optimize with the
 * per-category SVGO profile decided in #295/#296, write minified output under the same relative path. Sources in media/
 * are kept pretty-printed (git-diffable) — this script rewrites them in place through a plugin-less pretty pass, so
 * authoring dumps stay reviewable.
 *
 * Bun run generate:vectors
 *
 * Identity note: output bytes are reproducible from ingredients (media bytes + vectorRules + vectorNormalize + this
 * script + pinned svgo/svgpath/linkedom), which is what lets the renderer manifest ingredient-hash vectors instead of
 * hashing output (#269 precedent).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { DOMParser } from 'linkedom';
import { optimize } from 'svgo';
import type { Config } from 'svgo';

import { normalizeSvg } from '../src/shared/vectorNormalize';
import type { SvgDom, SvgElementLike } from '../src/shared/vectorNormalize';
import { VECTOR_AUTHORED_ATTRIBUTE, VECTOR_CATEGORY_RULES, VECTOR_PRECISION } from '../src/shared/vectorRules';
import type { VectorCategory } from '../src/shared/vectorRules';

const repoRoot = path.resolve(import.meta.dirname, '..');
const mediaRoot = path.join(repoRoot, 'media/vector');
const publicRoot = path.join(repoRoot, 'public/vector');

export const linkedomDom: SvgDom = {
  parse(svg) {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = document.documentElement as unknown as SvgElementLike | null;
    if (!root || root.tagName.toLowerCase() !== 'svg') {
      throw new Error('not an <svg> document');
    }
    return root;
  },
  serialize(root) {
    return root.toString();
  },
};

/**
 * Per-category SVGO profile (#295 research, spike-verified):
 *
 * - `cleanupIds` off everywhere: every file's `#root` is externally referenced, and the default plugin deletes
 *   externally-referenced ids — the research's top hazard.
 * - `removeUselessStrokeAndFill` off: the only plugin that can add paint to paint-inheriting files.
 * - `convertTransform.matrixToTransform` off: svgo#1222 shear bug (defensive — normalization bakes all transforms away).
 * - Fragment-API files additionally keep their group structure so place-ids survive.
 */
export function svgoConfigFor(category: VectorCategory): Config {
  const fragmentApi = VECTOR_CATEGORY_RULES[category].fragmentApi;
  return {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            cleanupIds: false,
            removeUselessStrokeAndFill: false,
            convertTransform: { matrixToTransform: false },
            convertPathData: { floatPrecision: VECTOR_PRECISION },
            cleanupNumericValues: { floatPrecision: VECTOR_PRECISION },
            ...(fragmentApi
              ? {
                  collapseGroups: false,
                  mergePaths: false,
                  removeEmptyContainers: false,
                }
              : {}),
          },
        },
      },
    ],
  };
}

const PRETTY_CONFIG: Config = {
  plugins: [],
  js2svg: { pretty: true, indent: 2 },
};

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

if (import.meta.main) {
  rmSync(publicRoot, { recursive: true, force: true });
  let generated = 0;
  const failures: string[] = [];

  for (const source of walk(mediaRoot).filter((file) => file.endsWith('.svg'))) {
    const relative = path.relative(mediaRoot, source).split(path.sep).join('/');
    const category = relative.split('/')[0] as VectorCategory;
    if (!(category in VECTOR_CATEGORY_RULES)) {
      failures.push(`${relative}: unknown vector category`);
      continue;
    }
    const raw = readFileSync(source, 'utf8');
    try {
      // Keep the media source pretty-printed and stable (format-only pass).
      const pretty = optimize(raw, PRETTY_CONFIG).data;
      if (pretty !== raw) {
        writeFileSync(source, pretty);
      }

      const normalized = normalizeSvg(pretty, linkedomDom);
      const optimized = optimize(normalized, svgoConfigFor(category)).data;
      // The stamp is an authoring provenance marker; published output never carries it.
      const output = optimized.replace(new RegExp(` ${VECTOR_AUTHORED_ATTRIBUTE}="[^"]*"`), '');

      const destination = path.join(publicRoot, relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, output);
      generated += 1;
    } catch (error) {
      failures.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    console.error(`\n${failures.length} vector generation failure(s)`);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, generated }));
}

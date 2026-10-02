import { fileURLToPath } from 'node:url';

import { parseAst } from 'vite';
import type { Alias, Plugin } from 'vite';

/**
 * drei's WebGPU entry imports the plain `@react-three/fiber` entry and one class from three's source tree, which three marks as having side effects.
 * Both kept a second fiber and a second copy of three's src-tree node classes next to the `@react-three/fiber/webgpu` and `three/webgpu` builds the table runs on.
 * As aliases they apply to the build, the dev server's dependency optimizer and Storybook alike, so every runtime loads one graph.
 */
export const threeRendererStackAliases: Alias[] = [
  /* A regular expression, so `@react-three/fiber/webgpu` itself is left alone. */
  { find: /^@react-three\/fiber$/u, replacement: '@react-three/fiber/webgpu' },
  {
    find: 'three/src/nodes/functions/PhysicalLightingModel.js',
    replacement: fileURLToPath(new URL('../../src/app/routes/_app/play/physicalLightingModel.ts', import.meta.url)),
  },
];

/** The single-file bundles the table imports whose static assignments pin unused loaders. */
const STATIC_ASSIGNMENT_BUNDLES = /\/@react-three\/(?:fiber\/dist\/webgpu|drei\/webgpu)\/index\.mjs$/u;

type Node = { type: string; start: number; end: number; [key: string]: unknown };

/** A parsed module and the text insertions planned for it. */
type Bundle = { code: string; body: Node[]; edits: { at: number; text: string }[] };

/** `name.property = …` with no further member access before the `=`. */
const STATIC_ASSIGNMENT = /^([A-Za-z_$][\w$]*)\.[A-Za-z_$][\w$]*\s*=(?!=)/u;

/** `name.property = value;` at the top level of a module, as the name it assigns to. */
function staticAssignmentTarget(bundle: Bundle, statement: Node): string | undefined {
  const text = statement.type === 'ExpressionStatement' ? bundle.code.slice(statement.start, statement.end) : '';
  return STATIC_ASSIGNMENT.exec(text)?.[1];
}

/** The names a top-level `const`/`let`/`var` binds, with `''` for a destructuring pattern. */
function declaredNames(statement: Node): string[] {
  const declarators = statement.type === 'VariableDeclaration' ? (statement.declarations as Node[]) : [];
  return declarators.map((declarator) => ((declarator.id as Node).name as string | undefined) ?? '');
}

/** Whether the bundle names `binding` as a whole identifier outside `body[first]` to `body[last]`. */
function namedOutside(bundle: Bundle, range: { first: number; last: number }, binding: string): boolean {
  const outside = bundle.code.slice(0, bundle.body[range.first].start) + bundle.code.slice(bundle.body[range.last].end);
  const escaped = binding.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
  return new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])`, 'u').test(outside);
}

/** The index of the last `name.property = …;` that follows `body[index]`, past nothing but variable declarations. */
function lastStaticAssignment(bundle: Bundle, index: number, name: string): number {
  let last = index;
  for (let next = index + 1; next < bundle.body.length; next += 1) {
    if (staticAssignmentTarget(bundle, bundle.body[next]) === name) {
      last = next;
    } else if (bundle.body[next].type !== 'VariableDeclaration') {
      break;
    }
  }
  return last;
}

/**
 * Wraps `function name() {}` at `body[index]` and its statics in one pure call, and returns the index of the last statement it took.
 * fiber and drei declare `preloadDefaultOptions` between `useEnvironment` and its statics;
 * such a declaration moves into the call only when nothing else names it.
 */
function wrapHookStatics(bundle: Bundle, index: number): number {
  const statement = bundle.body[index];
  const name = ((statement.id as Node | null)?.name as string | undefined) ?? '';
  const range = { first: index, last: name ? lastStaticAssignment(bundle, index, name) : index };
  const enclosed = bundle.body.slice(index + 1, range.last).flatMap(declaredNames);
  if (range.last === index || enclosed.some((binding) => binding === '' || namedOutside(bundle, range, binding))) {
    return index;
  }
  bundle.edits.push({ at: statement.start, text: `const ${name} = /* @__PURE__ */ (() => { ` });
  bundle.edits.push({ at: bundle.body[range.last].end, text: ` return ${name}; })();` });
  return range.last;
}

/** drei: `const KTX2LoaderService = globalThis[SERVICE_KEY] || (globalThis[SERVICE_KEY] = new KTX2LoaderServiceImpl());` becomes a pure call. */
function wrapGlobalSingletons(bundle: Bundle, statement: Node): void {
  const declarators = statement.type === 'VariableDeclaration' ? (statement.declarations as Node[]) : [];
  for (const init of declarators.map((declarator) => declarator.init as Node | null)) {
    if (init?.type === 'LogicalExpression' && bundle.code.startsWith('globalThis[', init.start)) {
      bundle.edits.push({ at: init.start, text: '/* @__PURE__ */ (() => ' });
      bundle.edits.push({ at: init.end, text: ')()' });
    }
  }
}

/**
 * Rewrites a module so its hook statics and lazy singletons drop out when nothing uses them.
 * fiber's and drei's WebGPU entries are each one file, and the bundler keeps a top-level `useGLTF.preload = …` whether or not `useGLTF` is used, because a property write counts as a side effect.
 * Those statics keep the GLTF, FBX, KTX2, EXR, HDR and gain-map loaders alive, and gain-map's decoder brings three's whole WebGL renderer with it, about 330 KB the table never runs.
 * Each `function useX() {}` followed directly by its `useX.property = …;` statements becomes a pure call that returns the function with the same properties, and drei's KTX2 service singleton becomes a pure call too.
 * The code only gains text around existing statements, so it still runs in the same order when it is used.
 */
export function pureStaticAssignments(code: string): string {
  const bundle: Bundle = { code, body: (parseAst(code) as unknown as { body: Node[] }).body, edits: [] };
  for (let index = 0; index < bundle.body.length; index += 1) {
    if (bundle.body[index].type === 'FunctionDeclaration') {
      index = wrapHookStatics(bundle, index);
    } else {
      wrapGlobalSingletons(bundle, bundle.body[index]);
    }
  }
  if (bundle.edits.length === 0) {
    throw new Error(
      'pureStaticAssignments found nothing to rewrite; the bundle changed shape, so check whether its loaders still drop out.'
    );
  }
  let rewritten = code;
  for (const { at, text } of bundle.edits.sort((a, b) => b.at - a.at)) {
    rewritten = rewritten.slice(0, at) + text + rewritten.slice(at);
  }
  return rewritten;
}

const CANVAS_BACKGROUND = 'backgroundProps && /* @__PURE__ */ jsx(Environment, { ...backgroundProps })';

/**
 * Cuts fiber's `<Canvas background>` support out of its WebGPU entry.
 * `<Canvas>` renders `<Environment>` for a `background` prop, and `<Environment>` reaches every loader `useEnvironment` can pick, so the statics rewrite alone leaves the gain-map decoder and three's WebGL renderer in the table chunk.
 * No canvas here passes `background` (scenes set `scene.background` themselves), so the prop now fails loudly instead of loading an environment.
 * The text is matched exactly, so an upgrade that moves it fails the build rather than quietly bringing the loaders back.
 */
export function withoutCanvasBackground(code: string): string {
  if (!code.includes(CANVAS_BACKGROUND)) {
    throw new Error(
      'withoutCanvasBackground: fiber no longer renders <Environment> for <Canvas background> the way it did; check whether its loaders still drop out of the table chunk.'
    );
  }
  return (
    code.replace(CANVAS_BACKGROUND, 'backgroundProps && canvasBackgroundIsNotBundled()') +
    '\nfunction canvasBackgroundIsNotBundled() {\n  throw new Error("<Canvas background> is not bundled in Dune Zone; set scene.background instead (scripts/lib/threeRendererStack.ts).");\n}\n'
  );
}

const FIBER_WEBGPU = /\/@react-three\/fiber\/dist\/webgpu\/index\.mjs$/u;

/** Applies {@link pureStaticAssignments} to fiber's and drei's WebGPU entries, and {@link withoutCanvasBackground} to fiber's. */
export function threeRendererStackTreeShaking(): Plugin {
  return {
    name: 'dunezone:three-renderer-stack-tree-shaking',
    transform: {
      filter: { id: STATIC_ASSIGNMENT_BUNDLES },
      handler(code, id) {
        /* Only text is inserted or replaced within a line, so every original line keeps its number. */
        const statics = pureStaticAssignments(code);
        return { code: FIBER_WEBGPU.test(id) ? withoutCanvasBackground(statics) : statics, map: null };
      },
    },
  };
}

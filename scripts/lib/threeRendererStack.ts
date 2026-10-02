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

type Edit = { at: number; text: string };

/** `name.property = value;` at the top level of a module, as the name it assigns to. */
function staticAssignmentTarget(statement: Node): string | undefined {
  const expression = statement.type === 'ExpressionStatement' ? (statement.expression as Node) : undefined;
  const left =
    expression?.type === 'AssignmentExpression' && expression.operator === '=' ? (expression.left as Node) : undefined;
  const object = left?.type === 'MemberExpression' && !left.computed ? (left.object as Node) : undefined;
  return object?.type === 'Identifier' ? (object.name as string) : undefined;
}

/** The names a top-level `const`/`let`/`var` binds, with `''` for a destructuring pattern. */
function declaredNames(statement: Node): string[] {
  const declarators = statement.type === 'VariableDeclaration' ? (statement.declarations as Node[]) : [];
  return declarators.map((declarator) => ((declarator.id as Node).name as string | undefined) ?? '');
}

/** Whether `code` mentions `name` as a whole identifier, not as a property. */
function mentions(code: string, name: string): boolean {
  const escaped = name.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
  return new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])`, 'u').test(code);
}

/** The index of the last `name.property = …;` that follows `body[index]`, past nothing but variable declarations. */
function lastStaticAssignment(body: Node[], index: number, name: string): number {
  let last = index;
  for (let next = index + 1; next < body.length; next += 1) {
    if (staticAssignmentTarget(body[next]) === name) {
      last = next;
    } else if (body[next].type !== 'VariableDeclaration') {
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
function wrapHookStatics(code: string, body: Node[], index: number, edits: Edit[]): number {
  const statement = body[index];
  const name = (statement.id as Node | null)?.name as string | undefined;
  const last = name ? lastStaticAssignment(body, index, name) : index;
  if (!name || last === index) {
    return index;
  }
  const outside = code.slice(0, statement.start) + code.slice(body[last].end);
  const enclosed = body.slice(index + 1, last).flatMap(declaredNames);
  if (enclosed.some((binding) => binding === '' || mentions(outside, binding))) {
    return index;
  }
  edits.push({ at: statement.start, text: `const ${name} = /* @__PURE__ */ (() => { ` });
  edits.push({ at: body[last].end, text: ` return ${name}; })();` });
  return last;
}

/** drei: `const KTX2LoaderService = globalThis[SERVICE_KEY] || (globalThis[SERVICE_KEY] = new KTX2LoaderServiceImpl());` becomes a pure call. */
function wrapGlobalSingletons(code: string, statement: Node, edits: Edit[]): void {
  const declarators = statement.type === 'VariableDeclaration' ? (statement.declarations as Node[]) : [];
  for (const init of declarators.map((declarator) => declarator.init as Node | null)) {
    if (init?.type === 'LogicalExpression' && code.startsWith('globalThis[', init.start)) {
      edits.push({ at: init.start, text: '/* @__PURE__ */ (() => ' });
      edits.push({ at: init.end, text: ')()' });
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
  const body = (parseAst(code) as unknown as { body: Node[] }).body;
  const edits: Edit[] = [];
  for (let index = 0; index < body.length; index += 1) {
    if (body[index].type === 'FunctionDeclaration') {
      index = wrapHookStatics(code, body, index, edits);
    } else {
      wrapGlobalSingletons(code, body[index], edits);
    }
  }
  if (edits.length === 0) {
    throw new Error(
      'pureStaticAssignments found nothing to rewrite; the bundle changed shape, so check whether its loaders still drop out.'
    );
  }
  let rewritten = code;
  for (const { at, text } of edits.sort((a, b) => b.at - a.at)) {
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

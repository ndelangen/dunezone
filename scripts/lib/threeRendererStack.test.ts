import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseAst } from 'vite';
import { describe, expect, it } from 'vitest';

import { pureStaticAssignments, withoutCanvasBackground } from './threeRendererStack.ts';

/** Evaluates a rewritten module body and returns what it assigned to `exports`. */
function run(code: string): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  new Function('exports', code)(exports);
  return exports;
}

describe('pureStaticAssignments', () => {
  it('turns a hook and its statics into one pure call that keeps every property', () => {
    const source = [
      'const loaded = [];',
      'function useThing(url) { return url; }',
      'useThing.preload = (url) => loaded.push(url);',
      'useThing.clear = () => loaded.splice(0);',
      'exports.useThing = useThing; exports.loaded = loaded;',
    ].join('\n');
    const rewritten = pureStaticAssignments(source);

    expect(rewritten).toContain('const useThing = /* @__PURE__ */ (() => { function useThing');
    expect(rewritten.split('\n')).toHaveLength(source.split('\n').length);
    const { useThing, loaded } = run(rewritten) as {
      useThing: ((url: string) => string) & { preload(url: string): void };
      loaded: string[];
    };
    useThing.preload('/map.png');
    expect(useThing('/x')).toBe('/x');
    expect(loaded).toEqual(['/map.png']);
  });

  it('moves a declaration between the hook and its statics into the call only when nothing else names it', () => {
    const privateOptions = [
      'function useEnvironment() {}',
      'const preloadDefaultOptions = { path: "" };',
      'useEnvironment.preload = () => preloadDefaultOptions;',
    ].join('\n');
    expect(pureStaticAssignments(privateOptions)).toContain('/* @__PURE__ */ (() => { function useEnvironment');

    const sharedOptions = `${privateOptions}\nexports.options = preloadDefaultOptions;\nfunction useOther() {}\nuseOther.clear = () => {};`;
    const rewritten = pureStaticAssignments(sharedOptions);
    expect(rewritten).not.toContain('(() => { function useEnvironment');
    expect(rewritten).toContain('(() => { function useOther');
  });

  it("makes drei's KTX2 service singleton a pure call and leaves other global registrations alone", () => {
    const source = [
      'const SERVICE_KEY = "k";',
      'const KTX2LoaderService = globalThis[SERVICE_KEY] || (globalThis[SERVICE_KEY] = { ready: true });',
      'const context = globalThis.ctx ?? (globalThis.ctx = {});',
      'exports.service = KTX2LoaderService;',
    ].join('\n');
    const rewritten = pureStaticAssignments(source);

    expect(rewritten).toContain('const KTX2LoaderService = /* @__PURE__ */ (() => globalThis[SERVICE_KEY]');
    expect(rewritten).toContain('const context = globalThis.ctx ??');
    expect(run(rewritten).service).toEqual({ ready: true });
    delete (globalThis as Record<string, unknown>).k;
    delete (globalThis as Record<string, unknown>).ctx;
  });

  it('closes the call even when the last static has no semicolon', () => {
    const { useThing } = run(
      pureStaticAssignments('function useThing() {}\nuseThing.clear = () => 1\nexports.useThing = useThing;')
    ) as {
      useThing: { clear(): number };
    };
    expect(useThing.clear()).toBe(1);
  });

  it('fails when a bundle offers nothing to rewrite', () => {
    expect(() => pureStaticAssignments('export const a = 1;')).toThrow(/found nothing to rewrite/u);
  });
});

/*
 * These read the installed third-party bundles as text on purpose (ADR-0001's narrow exception): the rewrite targets a shape of fiber's and drei's published code that no type can describe, and a dependency upgrade that changes it must fail here rather than quietly put the loaders back in the table chunk.
 */
describe('the installed fiber and drei bundles', () => {
  const bundle = (specifier: string) => readFileSync(fileURLToPath(import.meta.resolve(specifier)), 'utf8');
  const wrapped = (code: string) =>
    [...code.matchAll(/const (\w+) = \/\* @__PURE__ \*\/ \(\(\) => \{ function \1\b/gu)]
      .map((match) => match[1])
      .sort();

  it('still have the shapes the rewrite expects, so their loaders stay out of the table chunk', () => {
    const fiber = pureStaticAssignments(bundle('@react-three/fiber/webgpu'));
    const drei = pureStaticAssignments(bundle('@react-three/drei/webgpu'));

    expect(wrapped(fiber)).toEqual(['useEnvironment', 'useLoader', 'useTexture']);
    expect(wrapped(drei)).toEqual([
      'useCubeTexture',
      'useEnvironment',
      'useFBX',
      'useFont',
      'useGLTF',
      'useKTX2',
      'useSpriteLoader',
      'useTexture',
    ]);
    expect(drei).toContain('const KTX2LoaderService = /* @__PURE__ */ (() => globalThis[SERVICE_KEY]');
    expect(() => parseAst(withoutCanvasBackground(fiber))).not.toThrow();
    expect(() => parseAst(drei)).not.toThrow();
  });
});

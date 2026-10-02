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

  it('makes a lazily created global singleton a pure call', () => {
    const source =
      'const SERVICE_KEY = "k";\nconst service = globalThis[SERVICE_KEY] || (globalThis[SERVICE_KEY] = { ready: true });\nexports.service = service;';
    const rewritten = pureStaticAssignments(source);

    expect(rewritten).toContain('const service = /* @__PURE__ */ (() => globalThis[SERVICE_KEY]');
    expect(run(rewritten).service).toEqual({ ready: true });
    delete (globalThis as Record<string, unknown>).k;
  });

  it('fails when a bundle offers nothing to rewrite', () => {
    expect(() => pureStaticAssignments('export const a = 1;')).toThrow(/found nothing to rewrite/u);
  });
});

describe('the installed fiber and drei bundles', () => {
  const bundle = (specifier: string) => readFileSync(fileURLToPath(import.meta.resolve(specifier)), 'utf8');

  it('still have the shapes the rewrite expects, so their loaders stay out of the table chunk', () => {
    const fiber = pureStaticAssignments(bundle('@react-three/fiber/webgpu'));
    const drei = pureStaticAssignments(bundle('@react-three/drei/webgpu'));

    expect(fiber).toContain('const useEnvironment = /* @__PURE__ */ (() => { function useEnvironment');
    expect(drei).toContain('const useGLTF = /* @__PURE__ */ (() => { function useGLTF');
    expect(drei).toContain('const KTX2LoaderService = /* @__PURE__ */ (() => globalThis[SERVICE_KEY]');
    expect(() => parseAst(withoutCanvasBackground(fiber))).not.toThrow();
    expect(() => parseAst(drei)).not.toThrow();
  });
});

import { resolve } from 'node:path';

import { expect, test } from 'vite-plus/test';

import { auditReactCompiler } from '../assert-react-compiler';

const filename = resolve(import.meta.dirname, '../../src/app/ui/content/CompilerProbe.tsx');

test('the compiler audit accepts a component that follows the hook rules', () => {
  expect(
    auditReactCompiler([
      { filename, source: 'function Probe() { const [value] = useState(0); return <p>{value}</p>; }' },
    ])
  ).toEqual({ compiled: 1, diagnostics: [] });
});

test('the compiler audit rejects conditional hooks', () => {
  const result = auditReactCompiler([
    { filename, source: 'function Probe({ active }) { if (active) { return useState(0); } return null; }' },
  ]);
  expect(result.compiled).toBe(0);
  expect(result.diagnostics).toEqual([expect.stringContaining('Hooks must always be called in a consistent order')]);
});

test('the compiler audit rejects an explicit compiler opt-out', () => {
  const result = auditReactCompiler([
    { filename, source: 'function Probe() { "use no memo"; return <p>Skipped</p>; }' },
  ]);
  expect(result.compiled).toBe(0);
  expect(result.diagnostics).toEqual([expect.any(String)]);
});

import { fileURLToPath } from 'node:url';

/* Package mock IDs end in JavaScript; resolve the typed source so Vite compiles it. */
export const convexPackageMocks = [
  { find: /^convex\/react$/, replacement: fileURLToPath(new URL('../__mocks__/convex/react.ts', import.meta.url)) },
  { find: /^convex\/browser$/, replacement: fileURLToPath(new URL('../__mocks__/convex/browser.ts', import.meta.url)) },
  {
    find: /^@convex-dev\/auth\/react$/,
    replacement: fileURLToPath(new URL('../__mocks__/@convex-dev/auth/react.ts', import.meta.url)),
  },
];

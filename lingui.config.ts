import { defineConfig } from '@lingui/cli';

/* SPIKE (i18n option C): English source text in the code, one PO catalogue per language. */
export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'nl'],
  catalogs: [{ path: '<rootDir>/src/locales/{locale}/messages', include: ['src/app'] }],
});

import { defineConfig } from 'vite-plus';

/* The mutation trial covers the isolated load-target guards without booting an application or backend. */
export default defineConfig({
  test: {
    include: ['src/shared/play/loadTarget.test.ts'],
    retry: 0,
  },
});

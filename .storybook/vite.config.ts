import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    assetsDir: 'public',
  },
  define: {
    /**
     * Never copy a developer or production deployment URL into the public catalogue.
     * The global manual mock ignores this inert value when app database modules load.
     */
    'import.meta.env.VITE_CONVEX_URL': JSON.stringify('storybook-disconnected'),
  },
  publicDir: false,
  resolve: {
    // Keep Storybook path resolution aligned with the app config.
    ...({ tsconfigPaths: true } as Record<string, unknown>),
  },
  plugins: [viteReact()],
});

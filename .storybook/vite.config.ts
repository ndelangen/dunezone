import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    assetsDir: 'public',
  },
  publicDir: false,
  resolve: {
    // Keep Storybook path resolution aligned with the app config.
    ...({ tsconfigPaths: true } as Record<string, unknown>),
  },
  plugins: [viteReact()],
});

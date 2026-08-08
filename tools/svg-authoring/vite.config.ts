import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3000,
  },
  optimizeDeps: {
    // Pre-bundle the lazily imported, heavy deps so the dev dep-optimizer
    // doesn't kick in mid-session (which makes dynamic imports fail to fetch).
    include: [
      "svgo/browser",
      "three",
      "three/examples/jsm/loaders/SVGLoader.js",
      "three/examples/jsm/exporters/OBJExporter.js",
      "three/examples/jsm/utils/BufferGeometryUtils.js",
    ],
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    viteReact(),
  ],
});

import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  envDir: '..',
  // Relative assets make the same dist portable to / and /roadforge/. They also
  // keep vite-plugin-cesium's copied assets at dist/cesium instead of nesting
  // the deployment prefix inside the artifact.
  base: './',
  plugins: [cesium()],
  build: { outDir: '../dist', emptyOutDir: true },
});

import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({ root: 'web', publicDir: 'public', plugins: [cesium()], build: { outDir: '../dist', emptyOutDir: true } });

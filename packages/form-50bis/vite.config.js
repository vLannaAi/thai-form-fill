import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.js'),
      name: 'Form50Bis',
      fileName: 'form-50bis',
      formats: ['es', 'umd'],
    },
    rollupOptions: { external: ['vue'], output: { globals: { vue: 'Vue' } } },
    assetsInlineLimit: 0, // keep background.svg as an emitted file (?url), not inlined
  },
});

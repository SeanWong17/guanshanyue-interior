import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [{
    name: 'model-assets',
    closeBundle() {
      const files = ['README.md',
        'output/apartment_v1.blend', 'output/apartment_v1.glb',
        ...readdirSync(resolve(root, 'output')).filter(name => /^\d+_.*\.png$/.test(name)).map(name => `output/${name}`)];
      for (const file of files) {
        const destination = resolve(root, 'dist', file);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(resolve(root, file), destination);
      }
    },
  }],
});

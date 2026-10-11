// base: './' gera caminhos relativos → o build funciona em qualquer
// subpasta (ex.: https://usuario.github.io/robo-ecologico/)
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});

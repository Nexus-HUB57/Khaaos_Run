import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page build:
//   /            -> Khaaos Run 3D (TPS Battle Royale, FreeFire-style)
//   /classic.html-> Khaaos Run 2D (top-down tático, legado)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        classic: resolve(__dirname, 'classic.html'),
      },
    },
  },
});

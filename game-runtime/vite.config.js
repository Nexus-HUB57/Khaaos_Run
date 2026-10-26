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
  server: {
    proxy: {
      // dev: mesmo princípio do modo online 2D — cliente fala com o servidor
      // autoritativo na mesma origem (/ws com upgrade WebSocket, /auth login).
      // 127.0.0.1 explícito: "localhost" resolve ::1 primeiro em alguns sistemas
      // e o servidor autoritativo escuta IPv4 — evita ECONNREFUSED intermitente.
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
      '/auth': { target: 'http://127.0.0.1:8787' },
      '/healthz': { target: 'http://127.0.0.1:8787' },
      '/readyz': { target: 'http://127.0.0.1:8787' },
      '/admin': { target: 'http://127.0.0.1:8787' },
      '/poj': { target: 'http://127.0.0.1:8787' }, // Fase 9 — painel POJ no modal ZU
      '/profile': { target: 'http://127.0.0.1:8787' }, // Fase 10 — patente do perfil (chip POJ)
    },
  },
});

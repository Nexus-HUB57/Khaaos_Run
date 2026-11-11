// Preview local da sandbox — porta fixa 3000 com hosts liberados.
// Herda o proxy /ws + /auth /healthz /readyz /admin /poj /profile do vite.config.js.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';

export default mergeConfig(
  {
    server: { port: 3000, strictPort: true, host: true, allowedHosts: true },
    preview: { port: 3000, strictPort: true, host: true, allowedHosts: true },
  },
  base,
);

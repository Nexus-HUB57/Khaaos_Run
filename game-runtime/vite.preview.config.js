import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';

// Stack de preview do sandbox: Vite :3000 atrás do gateway (:81).
// - allowedHosts: true — o host externo do preview é dinâmico (*.space-z.ai),
//   não dá para fixar allowlist sem quebrar o acesso externo.
// - port 3000 + strictPort: porta esperada pelo gateway; se estiver ocupada
//   deve falhar alto (não subir silenciosamente em outra porta).
// - Herda do base: proxy /ws (ws://127.0.0.1:8787), /auth, /healthz, /readyz,
//   /admin, /poj, /profile e o build multi-página (index + classic).
export default mergeConfig(
  {
    server: {
      port: 3000,
      strictPort: true,
      host: true,
      allowedHosts: true,
    },
    preview: {
      port: 3000,
      strictPort: true,
      host: true,
      allowedHosts: true,
    },
  },
  base,
);

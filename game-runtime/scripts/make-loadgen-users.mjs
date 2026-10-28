#!/usr/bin/env node
// Khaaos Run — M3: gera KR_USERS_JSON p/ o load generator.
// Uso:
//   KR_USERS_JSON=$(node scripts/make-loadgen-users.mjs --count 50) KR_DISTRIBUTED=1 node server/server.js
// Cria kr_bot001..kr_bot0NN com a senha kr123 (hash real via hashPassword).
import { hashPassword } from '../server/auth.js';

const args = process.argv.slice(2);
const count = Math.max(1, Math.min(2000, Number(args[args.indexOf('--count') + 1] || 50)));
const users = Array.from({ length: count }, (_, i) => ({
  id: `bot-${String(i + 1).padStart(3, '0')}`,
  username: `kr_bot${String(i + 1).padStart(3, '0')}`,
  passwordHash: hashPassword('kr123'),
  role: 'player',
  region: 'sa-east',
}));
process.stdout.write(JSON.stringify(users));

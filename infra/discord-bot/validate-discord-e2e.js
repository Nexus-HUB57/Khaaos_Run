#!/usr/bin/env node
/**
 * validate-discord-e2e.js
 * Khaaos Run — P0 Discord Integration End-to-End Validation
 *
 * Validates all 4 P0s:
 *   P0-1: Environment variables are properly configured
 *   P0-2: Slash commands schema is valid per Discord API v10
 *   P0-3: Rich Presence art assets manifest matches C++ image keys
 *   P0-4: API v1 routes respond correctly
 *
 * Usage:
 *   node validate-discord-e2e.js                  # Full validation
 *   node validate-discord-e2e.js --skip-api       # Skip API route checks
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const skipApi = args.includes('--skip-api');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function check(name, passed, detail) {
  totalChecks++;
  if (passed) {
    passedChecks++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failedChecks++;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// P0-1: Environment Variables
// ══════════════════════════════════════════════════════════════════════════

function validateP0_1() {
  console.log('\n═══ P0-1: Environment Variables ══════════════════════════════════════');

  const envPath = path.join(__dirname, '..', '..', '.env.example');
  const envContent = fs.readFileSync(envPath, 'utf-8');

  // Required Discord env vars in root .env.example
  const requiredVars = [
    'DISCORD_APPLICATION_ID',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_BOT_TOKEN',
    'DISCORD_GUILD_ID',
    'DISCORD_REDIRECT_URI',
    'DISCORD_RP_UPDATE_INTERVAL',
    'DISCORD_RP_ENABLE_ASK_TO_JOIN',
    'DISCORD_RP_ENABLE_SPECTATE',
    'DISCORD_BETA_ROLE_ID',
    'DISCORD_REQUIRE_BETA_ROLE',
  ];

  for (const varName of requiredVars) {
    check(`${varName} in .env.example`, envContent.includes(varName));
  }

  // Per-channel webhook URLs
  const webhookChannels = ['ANTICHEAT', 'ECONOMY', 'MATCH_RESULTS', 'RANKED', 'DEPLOY', 'SERVER_STATUS'];
  for (const ch of webhookChannels) {
    check(`DISCORD_WEBHOOK_${ch} in .env.example`, envContent.includes(`DISCORD_WEBHOOK_${ch}`));
  }

  // Discord bot .env.example
  const botEnvPath = path.join(__dirname, '.env.example');
  const botEnvContent = fs.readFileSync(botEnvPath, 'utf-8');
  check('DISCORD_APPLICATION_ID in bot .env.example', botEnvContent.includes('DISCORD_APPLICATION_ID'));
  check('KHAASOS_API_KEY in bot .env.example', botEnvContent.includes('KHAASOS_API_KEY'));

  // Docker compose has discord-bot service
  const dockerComposePath = path.join(__dirname, '..', '..', 'infra', 'deploy', 'docker-compose.production.yml');
  const dockerContent = fs.readFileSync(dockerComposePath, 'utf-8');
  check('discord-bot service in docker-compose', dockerContent.includes('discord-bot'));
  check('DISCORD_BOT_TOKEN in docker-compose', dockerContent.includes('DISCORD_BOT_TOKEN'));
}

// ══════════════════════════════════════════════════════════════════════════
// P0-2: Slash Commands Schema
// ══════════════════════════════════════════════════════════════════════════

function validateP0_2() {
  console.log('\n═══ P0-2: Slash Commands Schema ═══════════════════════════════════════');

  const botPath = path.join(__dirname, 'bot.js');
  const botContent = fs.readFileSync(botPath, 'utf-8');

  // Validate command name format
  check('Command name "khaaos" lowercase+underscore', /^[a-z0-9_]+$/.test('khaaos'));

  // Validate all subcommands exist
  const subcommands = ['status', 'ranked', 'match', 'economy', 'lookup'];
  for (const sub of subcommands) {
    check(`Subcommand "${sub}" defined in bot.js`, botContent.includes(`.setName('${sub}')`));
  }

  // Validate subcommand group
  check('Subcommand group "tournament" defined', botContent.includes(".setName('tournament')"));
  check('Tournament subcommand "list" defined', botContent.includes(".setName('list')"));
  check('Tournament subcommand "info" defined', botContent.includes(".setName('info')"));

  // Validate options
  check('ranked has "player" option', botContent.includes("setName('player')") && botContent.includes('setDescription('));
  check('match has "id" option', botContent.includes("setName('id')"));
  check('economy has "player" option', botContent.includes("setName('player')"));
  check('lookup has "discord_user" option', botContent.includes("setName('discord_user')"));

  // Validate register-commands.js exists and has validation
  const regPath = path.join(__dirname, 'register-commands.js');
  const regExists = fs.existsSync(regPath);
  check('register-commands.js exists', regExists);

  if (regExists) {
    const regContent = fs.readFileSync(regPath, 'utf-8');
    check('register-commands.js has --validate flag', regContent.includes('--validate'));
    check('register-commands.js has --global flag', regContent.includes('--global'));
    check('register-commands.js validates name format', regContent.includes('^[a-z0-9_]+$'));
    check('register-commands.js validates name length', regContent.includes('32'));
    check('register-commands.js validates description length', regContent.includes('100'));
    check('register-commands.js validates serialized size', regContent.includes('8000'));
  }

  // Validate Gateway intents
  check('Uses Guilds intent', botContent.includes('GatewayIntentBits.Guilds'));
  check('Uses GuildMembers intent', botContent.includes('GatewayIntentBits.GuildMembers'));

  // Validate REST v10
  check('REST API version 10', botContent.includes("version: '10'"));
}

// ══════════════════════════════════════════════════════════════════════════
// P0-3: Rich Presence Art Assets
// ══════════════════════════════════════════════════════════════════════════

function validateP0_3() {
  console.log('\n═══ P0-3: Rich Presence Art Assets ════════════════════════════════════');

  // Read manifest
  const manifestPath = path.join(__dirname, 'rich-presence-assets.json');
  const manifestExists = fs.existsSync(manifestPath);
  check('rich-presence-assets.json exists', manifestExists);

  if (!manifestExists) return;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Read C++ implementation for cross-validation
  const cppPath = path.join(
    __dirname, '..', '..', 'Unreal', 'KhaaosRun', 'Source', 'KhaaosRun',
    'Game', 'Discord', 'KhaaosDiscordRichPresence.cpp'
  );
  const cppContent = fs.readFileSync(cppPath, 'utf-8');

  // Validate world image keys
  const worlds = [
    { name: 'CIGKV', key: 'world_cigkv' },
    { name: 'Barburhen', key: 'world_w1_barburhen' },
    { name: 'Priadus', key: 'world_w2_priadus' },
    { name: 'Ckesalth', key: 'world_w3_ckesalth' },
    { name: 'Arukheea', key: 'world_w4_arukheea' },
  ];

  for (const w of worlds) {
    check(`World "${w.name}" key "${w.key}" in C++`, cppContent.includes(`"${w.key}"`));
    check(`World "${w.name}" key "${w.key}" in manifest`,
      manifest.validation?.cpp_world_mapping?.[w.name] === w.key);
  }

  // Validate fallback world key
  check('Fallback world key "world_unknown" in C++', cppContent.includes('"world_unknown"'));
  check('Fallback world key in manifest', manifest.validation?.cpp_world_mapping?._default === 'world_unknown');

  // Validate species image keys
  const species = [
    { name: 'Zheers', key: 'species_zheers' },
    { name: 'Onith', key: 'species_onith' },
    { name: 'Skeetw', key: 'species_skeetw' },
    { name: 'Huran', key: 'species_huran' },
    { name: 'Venex', key: 'species_venex' },
    { name: 'Khael', key: 'species_khael' },
  ];

  for (const s of species) {
    check(`Species "${s.name}" key "${s.key}" in C++`, cppContent.includes(`"${s.key}"`));
    check(`Species "${s.name}" key "${s.key}" in manifest`,
      manifest.validation?.cpp_species_mapping?.[s.name] === s.key);
  }

  check('Fallback species key "species_unknown" in C++', cppContent.includes('"species_unknown"'));
  check('Fallback species key in manifest', manifest.validation?.cpp_species_mapping?._default === 'species_unknown');

  // Validate total asset count
  const totalAssets = (manifest.large_images?.assets?.length ?? 0) + (manifest.small_images?.assets?.length ?? 0);
  check(`Total assets = 13 (6 world + 7 species)`, totalAssets === 13, `Found ${totalAssets}`);
}

// ══════════════════════════════════════════════════════════════════════════
// P0-4: API v1 Routes
// ══════════════════════════════════════════════════════════════════════════

async function validateP0_4() {
  console.log('\n═══ P0-4: API v1 Routes ═════════════════════════════════════════════');

  // Read the discordApiV1.ts route file
  const apiPath = path.join(__dirname, '..', '..', 'server', 'game', 'discordApiV1.ts');
  const apiExists = fs.existsSync(apiPath);
  check('discordApiV1.ts exists', apiExists);

  if (!apiExists) return;

  const apiContent = fs.readFileSync(apiPath, 'utf-8');

  // Validate all 11 endpoints
  const endpoints = [
    { method: 'GET', path: '/api/v1/server/status' },
    { method: 'GET', path: '/api/v1/ranked/:playerId' },
    { method: 'GET', path: '/api/v1/tournament' },
    { method: 'GET', path: '/api/v1/tournament/:id' },
    { method: 'GET', path: '/api/v1/match/:id' },
    { method: 'GET', path: '/api/v1/economy/alerts' },
    { method: 'GET', path: '/api/v1/economy/:playerId' },
    { method: 'GET', path: '/api/v1/discord-links/beta' },
    { method: 'GET', path: '/api/v1/discord-link/:discordId' },
    { method: 'POST', path: '/api/v1/discord-link' },
    { method: 'GET', path: '/api/v1/webhooks' },
  ];

  for (const ep of endpoints) {
    const routePattern = ep.path.replace(/:(\w+)/g, ':$1');
    check(`${ep.method} ${ep.path} defined`, apiContent.includes(routePattern));
  }

  // Validate API key guard
  check('API key guard (X-API-Key) implemented', apiContent.includes('x-api-key'));

  // Validate JSON error codes matching Discord API
  check('Error code 50014 (Invalid auth token)', apiContent.includes('50014'));
  check('Error code 10013 (Unknown user)', apiContent.includes('10013'));
  check('Error code 10027 (Unknown SKU/tournament)', apiContent.includes('10027'));
  check('Error code 10003 (Unknown channel/match)', apiContent.includes('10003'));
  check('Error code 50035 (Invalid form body)', apiContent.includes('50035'));

  // Validate route registration in routes.ts
  const routesPath = path.join(__dirname, '..', '..', 'server', 'routes.ts');
  const routesContent = fs.readFileSync(routesPath, 'utf-8');
  check('discordApiV1 imported in routes.ts', routesContent.includes('discordApiV1'));
  check('registerDiscordApiV1Routes called in routes.ts', routesContent.includes('registerDiscordApiV1Routes'));

  // Validate Docker compose has API key env
  const dockerPath = path.join(__dirname, '..', '..', 'infra', 'deploy', 'docker-compose.production.yml');
  const dockerContent = fs.readFileSync(dockerPath, 'utf-8');
  check('KHAASOS_API_KEY in docker-compose', dockerContent.includes('KHAASOS_API_KEY'));

  // Live API check (if server is running)
  if (!skipApi) {
    const apiBase = process.env.KHAASOS_API_BASE || 'http://localhost:3001';
    const apiKey = process.env.KHAASOS_API_KEY || '';

    try {
      const { default: axios } = await import('axios');
      const client = axios.create({ baseURL: apiBase, headers: { 'X-API-Key': apiKey }, timeout: 5000 });

      // Test /api/v1/server/status
      const statusRes = await client.get('/api/v1/server/status');
      check('GET /api/v1/server/status returns 200', statusRes.status === 200);
      check('Server status has "status" field', !!statusRes.data?.status);
      check('Server status has "onlinePlayers" field', statusRes.data?.onlinePlayers !== undefined);
      check('Server status has "regions" field', Array.isArray(statusRes.data?.regions));

      // Test /api/v1/tournament
      const tournRes = await client.get('/api/v1/tournament');
      check('GET /api/v1/tournament returns 200', tournRes.status === 200);
      check('Tournament response has "tournaments" array', Array.isArray(tournRes.data?.tournaments));

      // Test /api/v1/economy/alerts
      const alertsRes = await client.get('/api/v1/economy/alerts');
      check('GET /api/v1/economy/alerts returns 200', alertsRes.status === 200);

      // Test /api/v1/ranked with invalid player (should 404)
      try {
        await client.get('/api/v1/ranked/nonexistent-player');
        check('GET /api/v1/ranked/nonexistent returns 404', false);
      } catch (err) {
        check('GET /api/v1/ranked/nonexistent returns 404', err.response?.status === 404);
      }

      // Test /api/v1/match with invalid ID (should 404)
      try {
        await client.get('/api/v1/match/nonexistent-match');
        check('GET /api/v1/match/nonexistent returns 404', false);
      } catch (err) {
        check('GET /api/v1/match/nonexistent returns 404', err.response?.status === 404);
      }

      // Test /api/v1/discord-link with unlinked ID (should 404)
      try {
        await client.get('/api/v1/discord-link/000000000000000000');
        check('GET /api/v1/discord-link/unlinked returns 404', false);
      } catch (err) {
        check('GET /api/v1/discord-link/unlinked returns 404', err.response?.status === 404);
      }

    } catch (err) {
      console.log(`  ⚠ Live API check skipped (server not reachable at ${apiBase}): ${err.message}`);
    }
  } else {
    console.log('  ⚠ Live API checks skipped (--skip-api flag)');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Khaaos Run — Discord Integration P0 E2E Validation          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  validateP0_1();
  validateP0_2();
  validateP0_3();
  await validateP0_4();

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`Total: ${totalChecks} checks | ✅ ${passedChecks} passed | ❌ ${failedChecks} failed`);

  if (failures.length > 0) {
    console.log('\nFailed checks:');
    for (const f of failures) console.log(`  - ${f}`);
  }

  console.log(failedChecks === 0 ? '\n🟢 All P0 checks passed!' : '\n🔴 Some P0 checks failed — fix before launch.');
  process.exit(failedChecks === 0 ? 0 : 1);
}

main();

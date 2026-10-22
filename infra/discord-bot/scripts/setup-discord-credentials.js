#!/usr/bin/env node
// =============================================================================
// Khaaos Run — Discord Credentials Setup Wizard | Devs Ph.D
// =============================================================================
// Interactive CLI for configuring Discord credentials.
// Reads .env, validates values, auto-generates API key if missing.
//
// Usage:
//   node scripts/setup-discord-credentials.js          # Full wizard
//   node scripts/setup-discord-credentials.js --check   # Just validate
// =============================================================================

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');

const envPath = path.resolve(import.meta.dirname, '..', '.env');

// ─── Credential definitions ──────────────────────────────────────────────────

const CREDENTIALS = [
  {
    key: 'DISCORD_BOT_TOKEN', label: 'Bot Token',
    hint: 'Developer Portal → Bot → Reset Token',
    secret: true, required: true,
    validate: (v) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(v) ? null : 'Must be 3 dot-separated segments',
  },
  {
    key: 'DISCORD_APPLICATION_ID', label: 'Application ID',
    hint: 'Developer Portal → General Information → Application ID',
    secret: false, required: true,
    validate: (v) => /^\d{17,20}$/.test(v) ? null : 'Must be 17-20 digit snowflake',
  },
  {
    key: 'DISCORD_GUILD_ID', label: 'Guild ID',
    hint: 'Right-click server → Copy Server ID (Developer Mode on)',
    secret: false, required: true,
    validate: (v) => /^\d{17,20}$/.test(v) ? null : 'Must be 17-20 digit snowflake',
  },
  {
    key: 'DISCORD_BETA_ROLE_ID', label: 'Beta Role ID',
    hint: 'Right-click role → Copy Role ID (optional)',
    secret: false, required: false,
    validate: (v) => v === '' || /^\d{17,20}$/.test(v) ? null : 'Must be snowflake or blank',
  },
  {
    key: 'DISCORD_CLIENT_ID', label: 'OAuth2 Client ID',
    hint: 'Developer Portal → OAuth2 → Client ID',
    secret: false, required: false,
    validate: (v) => v === '' || /^\d{17,20}$/.test(v) ? null : 'Must be snowflake or blank',
  },
  {
    key: 'DISCORD_CLIENT_SECRET', label: 'OAuth2 Client Secret',
    hint: 'Developer Portal → OAuth2 → Reset Secret',
    secret: true, required: false,
    validate: (v) => v === '' || v.length >= 20 ? null : 'Must be >= 20 chars',
  },
  {
    key: 'KHAASOS_API_KEY', label: 'API Key (Bot→Economy)',
    hint: 'Auto-generated if blank (recommended)',
    secret: true, required: false,
    autoGenerate: () => crypto.randomBytes(32).toString('hex'),
    validate: (v) => v === '' || v.length >= 16 ? null : 'Must be >= 16 chars',
  },
];

const WEBHOOKS = [
  { key: 'DISCORD_WEBHOOK_ANTI_CHEAT', channel: '#anti-cheat' },
  { key: 'DISCORD_WEBHOOK_ECONOMY', channel: '#economy' },
  { key: 'DISCORD_WEBHOOK_MATCH_RESULTS', channel: '#match-results' },
  { key: 'DISCORD_WEBHOOK_RANKED', channel: '#ranked' },
  { key: 'DISCORD_WEBHOOK_DEPLOY', channel: '#deploy' },
  { key: 'DISCORD_WEBHOOK_SERVER_STATUS', channel: '#server-status' },
];

function maskSecret(value, visible = 4) {
  if (!value || value.length <= visible * 2) return value;
  return value.slice(0, visible) + '...' + value.slice(-visible);
}

const green = '\x1b[32m', red = '\x1b[31m', yellow = '\x1b[33m', cyan = '\x1b[36m';
const dim = '\x1b[2m', bold = '\x1b[1m', reset = '\x1b[0m';

console.log('\n═══════════════════════════════════════════════════════');
console.log(' Khaaos Run — Discord Credentials Setup Wizard');
console.log('═══════════════════════════════════════════════════════\n');

const configured = [], missing = [], invalid = [];

// Check core credentials
console.log(`${bold}─── Core Credentials ───${reset}`);
for (const cred of CREDENTIALS) {
  const value = process.env[cred.key] || '';
  const isSet = value && !value.includes('CHANGME') && !value.startsWith('staging_');
  if (isSet) {
    const error = cred.validate(value);
    if (error) {
      console.log(`  ${red}⚠️  ${cred.key}${reset} = ${maskSecret(value)} — ${red}${error}${reset}`);
      invalid.push({ ...cred, value, error });
    } else {
      console.log(`  ${green}✅ ${cred.key}${reset} = ${cred.secret ? maskSecret(value) : value}`);
      configured.push(cred.key);
    }
  } else {
    console.log(`  ${yellow}☐  ${cred.key}${reset} — ${dim}${cred.hint}${reset}`);
    missing.push(cred);
  }
}

// Check webhooks
console.log(`\n${bold}─── Webhooks ───${reset}`);
let webhooksOk = 0;
for (const wh of WEBHOOKS) {
  const value = process.env[wh.key] || '';
  const isSet = value && value.startsWith('https://discord.com/api/webhooks/');
  if (isSet) {
    const parts = value.split('/');
    const webhookId = parts[parts.length - 2];
    console.log(`  ${green}✅ ${wh.key}${reset} → ${wh.channel} (ID: ${webhookId})`);
    webhooksOk++;
  } else {
    console.log(`  ${yellow}☐  ${wh.key}${reset} → ${wh.channel}`);
  }
}

// Summary
console.log(`\n${bold}─── Summary ───${reset}`);
console.log(`  Core configured: ${green}${configured.length}${reset}/${CREDENTIALS.length}`);
console.log(`  Core invalid:    ${invalid.length > 0 ? red : green}${invalid.length}${reset}`);
console.log(`  Core missing:    ${missing.filter(c => c.required).length} required, ${missing.filter(c => !c.required).length} optional`);
console.log(`  Webhooks:        ${webhooksOk > 0 ? green : yellow}${webhooksOk}${reset}/${WEBHOOKS.length}`);

if (invalid.length > 0) {
  console.log(`\n${red}${bold}─── Invalid Values (FIX BEFORE LAUNCH) ───${reset}`);
  for (const { key, error } of invalid) {
    console.log(`  ${red}✗ ${key}: ${error}${reset}`);
  }
}

// Auto-generate API Key if missing
const apiKeyCred = missing.find(c => c.key === 'KHAASOS_API_KEY');
if (apiKeyCred && apiKeyCred.autoGenerate && !checkOnly) {
  const generated = apiKeyCred.autoGenerate();
  console.log(`\n${cyan}${bold}─── Auto-Generated ───${reset}`);
  console.log(`  ${cyan}🔑 KHAASOS_API_KEY = ${generated}${reset}`);
  console.log(`  ${dim}Add to .env and Economy API configuration.${reset}`);
}

// Developer Portal links
const appId = process.env.DISCORD_APPLICATION_ID || 'YOUR_APP_ID';
console.log(`\n${bold}─── Developer Portal Quick Links ───${reset}`);
console.log(`  Applications:  https://discord.com/developers/applications`);
console.log(`  Bot Page:      https://discord.com/developers/applications/${appId}/bot`);
console.log(`  OAuth2:        https://discord.com/developers/applications/${appId}/oauth2`);
console.log(`  Rich Presence: https://discord.com/developers/applications/${appId}/rich-presence`);
console.log(`  Guild:         https://discord.gg/GQCXA7YFu\n`);

if (invalid.length > 0 || missing.filter(c => c.required).length > 0) process.exit(1);

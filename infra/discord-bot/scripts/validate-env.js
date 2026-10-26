#!/usr/bin/env node
// =============================================================================
// Khaaos Run — Discord Environment Validation Script | Devs Ph.D
// =============================================================================
// Validates all Discord-related environment variables for production readiness.
//
// Usage:
//   node scripts/validate-env.js                  # Check all env vars
//   node scripts/validate-env.js --strict          # Exit 1 on any missing var
//   node scripts/validate-env.js --docker          # Also validate Docker compose refs
// =============================================================================

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const docker = args.includes('--docker');

// ─── Variable definitions ────────────────────────────────────────────────────
const REQUIRED = [
  { key: 'DISCORD_BOT_TOKEN',       desc: 'Bot token from Developer Portal → Bot → Token',                   secret: true },
  { key: 'DISCORD_APPLICATION_ID',  desc: 'Application ID from Developer Portal → General Information',      secret: false },
  { key: 'DISCORD_GUILD_ID',        desc: 'Guild ID for Khaaos Run Discord server (right-click server → Copy ID)', secret: false },
];

const RECOMMENDED = [
  { key: 'DISCORD_BETA_ROLE_ID',              desc: 'Beta tester role ID for auto-assignment',                 secret: false },
  { key: 'DISCORD_OAUTH2_CLIENT_ID',          desc: 'OAuth2 Client ID for Discord↔EOS linking',               secret: false },
  { key: 'DISCORD_OAUTH2_CLIENT_SECRET',      desc: 'OAuth2 Client Secret for Discord↔EOS linking',            secret: true },
  { key: 'DISCORD_OAUTH2_REDIRECT_URI',       desc: 'OAuth2 redirect URI (e.g. https://khaaos.run/api/discord/callback)', secret: false },
];

const WEBHOOKS = [
  { key: 'DISCORD_WEBHOOK_ANTI_CHEAT',     channel: 'anti-cheat',     color: '\x1b[31m' },  // red
  { key: 'DISCORD_WEBHOOK_ECONOMY',        channel: 'economy',        color: '\x1b[32m' },  // green
  { key: 'DISCORD_WEBHOOK_MATCH_RESULTS',  channel: 'match-results',  color: '\x1b[36m' },  // cyan
  { key: 'DISCORD_WEBHOOK_RANKED',         channel: 'ranked',         color: '\x1b[35m' },  // purple
  { key: 'DISCORD_WEBHOOK_DEPLOY',         channel: 'deploy',         color: '\x1b[33m' },  // yellow
  { key: 'DISCORD_WEBHOOK_SERVER_STATUS',  channel: 'server-status',  color: '\x1b[34m' },  // blue
];

const API_VARS = [
  { key: 'KHAASOS_API_BASE', desc: 'Economy API base URL', default: 'http://localhost:3001' },
  { key: 'KHAASOS_API_KEY',  desc: 'API key for authenticated endpoints', secret: true },
];

const reset = '\x1b[0m';
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const dim = '\x1b[2m';

// ─── Validation ──────────────────────────────────────────────────────────────
let errors = 0;
let warnings = 0;

function validateVar(varDef, category) {
  const value = process.env[varDef.key];
  const isSet = value && value.length > 0 && !value.includes('CHANGME');
  const masked = varDef.secret && isSet ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;

  if (isSet) {
    console.log(`  ${green}✅${reset} ${varDef.key} = ${varDef.secret ? masked : value}`);
  } else {
    const isRequired = category === 'required';
    const icon = isRequired ? `${red}❌${reset}` : `${yellow}⚠️${reset}`;
    console.log(`  ${icon} ${varDef.key} — ${dim}${varDef.desc || ''}${reset}`);
    if (isRequired) errors++;
    else warnings++;
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log(' Khaaos Run — Discord Environment Validation');
console.log('═══════════════════════════════════════════════════════');

// Required
console.log('\n─── Required Variables ──────────────────────────────────');
for (const v of REQUIRED) validateVar(v, 'required');

// Recommended
console.log('\n─── Recommended Variables ───────────────────────────────');
for (const v of RECOMMENDED) validateVar(v, 'recommended');

// Webhooks
console.log('\n─── Webhook URLs (per EKhaaosWebhookChannel) ───────────');
for (const w of WEBHOOKS) {
  const value = process.env[w.key];
  const isSet = value && value.length > 0 && !value.includes('CHANGME');
  const isValidUrl = isSet && value.startsWith('https://discord.com/api/webhooks/');

  if (isValidUrl) {
    const parts = value.split('/');
    const webhookId = parts[parts.length - 2];
    console.log(`  ${w.color}✅${reset} ${w.key} → #${w.channel} (ID: ${webhookId})`);
  } else if (isSet) {
    console.log(`  ${red}❌${reset} ${w.key} → #${w.channel} (INVALID URL FORMAT)`);
    errors++;
  } else {
    console.log(`  ${yellow}⚠️${reset} ${w.key} → #${w.channel} (${dim}not set${reset})`);
    warnings++;
  }
}

// API
console.log('\n─── API Configuration ──────────────────────────────────');
for (const v of API_VARS) {
  const value = process.env[v.key] || v.default;
  const isSet = value && value.length > 0;
  if (isSet) {
    console.log(`  ${green}✅${reset} ${v.key} = ${v.secret ? `${value.slice(0, 4)}...` : value}`);
  } else {
    console.log(`  ${yellow}⚠️${reset} ${v.key} — ${dim}${v.desc}${reset}`);
    warnings++;
  }
}

// Docker compose validation
if (docker) {
  console.log('\n─── Docker Compose References ───────────────────────────');
  const composePath = path.resolve(import.meta.dirname, '..', '..', 'deploy', 'docker-compose.production.yml');
  if (fs.existsSync(composePath)) {
    const content = fs.readFileSync(composePath, 'utf-8');
    const discordVars = [
      'DISCORD_BOT_TOKEN',
      'DISCORD_GUILD_ID',
      'DISCORD_BETA_ROLE_ID',
      'KHAASOS_API_BASE',
      'KHAASOS_API_KEY',
    ];
    for (const v of discordVars) {
      const inCompose = content.includes(v);
      console.log(`  ${inCompose ? `${green}✅${reset}` : `${red}❌${reset}`} ${v} ${inCompose ? 'referenced' : 'NOT in compose'} in docker-compose.production.yml`);
      if (!inCompose) warnings++;
    }
  } else {
    console.log(`  ${yellow}⚠️${reset} docker-compose.production.yml not found at ${composePath}`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n─── Summary ─────────────────────────────────────────────');
console.log(`  Required missing:  ${errors}`);
console.log(`  Recommended missing: ${warnings}`);
console.log(`  Overall: ${errors === 0 && warnings === 0 ? `${green}✅ READY FOR PRODUCTION${reset}` : errors === 0 ? `${yellow}⚠️ FUNCTIONAL (some optional vars missing)${reset}` : `${red}❌ NOT READY${reset}`}`);

// ─── Developer Portal Checklist ──────────────────────────────────────────────
console.log('\n─── Developer Portal Checklist ───────────────────────────');
console.log('  1. ☐ Create Application: https://discord.com/developers/applications');
console.log('  2. ☐ Bot → Reset Token → Copy DISCORD_BOT_TOKEN');
console.log('  3. ☐ Copy Application ID → DISCORD_APPLICATION_ID');
console.log('  4. ☐ Bot → Privileged Server Intents:');
console.log('       ☐ SERVER MEMBERS INTENT');
console.log('       ☐ MESSAGE CONTENT INTENT');
console.log('       ☐ PRESENCE INTENT (optional)');
console.log('  5. ☐ OAuth2 → Add Redirect: DISCORD_OAUTH2_REDIRECT_URI');
console.log('  6. ☐ Rich Presence → Art Assets → Upload 11 PNGs');
console.log('  7. ☐ Guild → Settings → Integrations → Add Bot');
console.log('  8. ☐ Guild → Channels → Create webhooks for 6 channels');
console.log('  9. ☐ Run: node scripts/register-commands.js');
console.log('');

if (strict && errors > 0) {
  process.exit(1);
}

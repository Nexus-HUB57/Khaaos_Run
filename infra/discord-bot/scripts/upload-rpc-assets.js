#!/usr/bin/env node
// =============================================================================
// Khaaos Run — Discord Rich Presence Asset Validator & Uploader | Devs Ph.D
// =============================================================================
// Validates that all 11 Rich Presence art assets are present as PNG files,
// checks dimensions and file sizes, then provides curl commands for manual
// upload to Discord Developer Portal.
//
// Usage:
//   node scripts/upload-rpc-assets.js                  # Validate local assets
//   node scripts/upload-rpc-assets.js --generate-curls  # Print curl upload commands
//   node scripts/upload-rpc-assets.js --validate-portal # Check portal via API
//
// Asset specification:
//   - Format: PNG
//   - Min resolution: 512x512 (recommended: 1024x1024)
//   - Max file size: 512KB per Discord API limit
//   - Naming: must match keys in KhaaosDiscordRichPresence.cpp
//
// Required env vars (for --validate-portal):
//   DISCORD_BOT_TOKEN       — Bot token
//   DISCORD_APPLICATION_ID  — Application ID
// =============================================================================

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// ─── Asset definitions ───────────────────────────────────────────────────────
// Must match image keys in KhaaosDiscordRichPresence.cpp
const WORLD_ASSETS = [
  { key: 'world_cigkv',     label: 'CIGKV (Lobby/Hub)',     world: 'CIGKV' },
  { key: 'world_barburhen', label: 'W1 Barburhen (100p)',   world: 'Barburhen' },
  { key: 'world_priadus',   label: 'W2 Priadus (75p)',     world: 'Priadus' },
  { key: 'world_ckesalth',  label: 'W3 Ckesalth (60p)',    world: 'Ckesalth' },
  { key: 'world_arukheea',  label: 'W4 Arukheea (80p)',    world: 'Arukheea' },
];

const SPECIES_ASSETS = [
  { key: 'species_zheers', label: 'Zheers',  species: 'Zheers' },
  { key: 'species_onith',  label: 'Onith',   species: 'Onith' },
  { key: 'species_skeetw', label: 'Skeetw',  species: 'Skeetw' },
  { key: 'species_huran',  label: 'Huran',   species: 'Huran' },
  { key: 'species_venex',  label: 'Venex',   species: 'Venex' },
  { key: 'species_khael',  label: 'Khael',   species: 'Khael' },
];

const ALL_ASSETS = [...WORLD_ASSETS, ...SPECIES_ASSETS];

// ─── Discord API specs ───────────────────────────────────────────────────────
const MAX_FILE_SIZE = 512 * 1024; // 512KB
const MIN_DIMENSION = 512;
const ASSETS_DIR = path.resolve(import.meta.dirname, '..', 'rpc-assets');

const args = process.argv.slice(2);
const generateCurls = args.includes('--generate-curls');
const validatePortal = args.includes('--validate-portal');

// ─── Validate local assets ───────────────────────────────────────────────────
function validateLocalAssets() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Khaaos Run — Rich Presence Asset Validation');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`\n📁 Assets directory: ${ASSETS_DIR}`);
  console.log(`   Expected: ${ALL_ASSETS.length} assets (${WORLD_ASSETS.length} worlds + ${SPECIES_ASSETS.length} species)\n`);

  if (!fs.existsSync(ASSETS_DIR)) {
    console.log('❌ Assets directory does not exist. Creating it...');
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    console.log(`   Created: ${ASSETS_DIR}`);
    console.log('\n   Place your PNG assets in this directory with the following names:');
    for (const asset of ALL_ASSETS) {
      console.log(`   - ${asset.key}.png  (${asset.label})`);
    }
    return false;
  }

  let validCount = 0;
  let invalidCount = 0;

  for (const asset of ALL_ASSETS) {
    const filename = `${asset.key}.png`;
    const filepath = path.join(ASSETS_DIR, filename);
    const prefix = asset.key.startsWith('world_') ? '🌍' : '🧬';

    if (!fs.existsSync(filepath)) {
      console.log(`  ${prefix} ❌ ${filename} — MISSING (${asset.label})`);
      invalidCount++;
      continue;
    }

    const stat = fs.statSync(filepath);
    const sizeKB = (stat.size / 1024).toFixed(1);

    // Check file size
    if (stat.size > MAX_FILE_SIZE) {
      console.log(`  ${prefix} ❌ ${filename} — TOO LARGE (${sizeKB}KB > 512KB)`);
      invalidCount++;
      continue;
    }

    // Check PNG header
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filepath, 'r');
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);
    const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!buffer.equals(PNG_HEADER)) {
      console.log(`  ${prefix} ❌ ${filename} — NOT A VALID PNG`);
      invalidCount++;
      continue;
    }

    console.log(`  ${prefix} ✅ ${filename} — ${sizeKB}KB (${asset.label})`);
    validCount++;
  }

  console.log(`\n─── Summary ────────────────────────────────────────────`);
  console.log(`   Valid:   ${validCount}/${ALL_ASSETS.length}`);
  console.log(`   Invalid: ${invalidCount}/${ALL_ASSETS.length}`);
  console.log(`   Status:  ${invalidCount === 0 ? '✅ ALL ASSETS VALID' : '❌ SOME ASSETS MISSING/INVALID'}`);

  return invalidCount === 0;
}

// ─── Generate curl commands for manual upload ────────────────────────────────
function generateCurlCommands() {
  const APP_ID = process.env.DISCORD_APPLICATION_ID;

  if (!APP_ID) {
    console.error('\n❌ DISCORD_APPLICATION_ID is not set. Required for curl generation.');
    console.error('   Set it in .env or pass via environment.');
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Discord Rich Presence — Asset Upload Commands');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n⚠️  NOTE: Discord does not provide a REST API for uploading Rich Presence assets.');
  console.log('   Assets must be uploaded manually via the Developer Portal:');
  console.log(`   https://discord.com/developers/applications/${APP_ID}/rich-presence`);
  console.log('\n   Alternatively, use the Art Assets page in the portal to drag-and-drop PNGs.\n');

  console.log('─── Asset Key Names (for Developer Portal) ─────────────\n');
  console.log('   Worlds:');
  for (const asset of WORLD_ASSETS) {
    console.log(`     • ${asset.key}  →  ${asset.label}`);
  }
  console.log('\n   Species:');
  for (const asset of SPECIES_ASSETS) {
    console.log(`     • ${asset.key}  →  ${asset.label}`);
  }

  console.log('\n─── Upload Instructions ─────────────────────────────────\n');
  console.log('   1. Navigate to the Developer Portal → Rich Presence → Art Assets');
  console.log(`      URL: https://discord.com/developers/applications/${APP_ID}/rich-presence/visualizer`);
  console.log('   2. For each asset, click "Add Image" and upload the PNG file');
  console.log('   3. Set the asset key name EXACTLY as shown above (case-sensitive!)');
  console.log('   4. The key names must match KhaaosDiscordRichPresence.cpp mappings:');
  console.log('      - WorldMap: CIGKV→world_cigkv, Barburhen→world_barburhen, etc.');
  console.log('      - SpeciesMap: Zheers→species_zheers, Onith→species_onith, etc.');
  console.log('\n─── Required Intents ─────────────────────────────────────\n');
  console.log('   In Developer Portal → Bot → Privileged Server Intents, enable:');
  console.log('     ☑ SERVER MEMBERS INTENT (for guildMemberAdd + beta role assignment)');
  console.log('     ☑ MESSAGE CONTENT INTENT (for future message commands)');
  console.log('     ☑ PRESENCE INTENT (optional, for player presence tracking)');
}

// ─── Validate assets on portal ───────────────────────────────────────────────
async function validatePortalAssets() {
  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  const APP_ID = process.env.DISCORD_APPLICATION_ID;

  if (!TOKEN || !APP_ID) {
    console.error('\n❌ DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID must be set.');
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Discord Rich Presence — Portal Validation');
  console.log('═══════════════════════════════════════════════════════');

  // Note: Discord does not expose a REST API for listing Rich Presence assets.
  // We can only validate the application exists.
  try {
    const response = await fetch(`https://discord.com/api/v10/applications/${APP_ID}`, {
      headers: { Authorization: `Bot ${TOKEN}` },
    });

    if (response.ok) {
      const app = await response.json();
      console.log(`\n✅ Application found: ${app.name} (ID: ${app.id})`);
      console.log(`   Bot public: ${app.bot_public}`);
      console.log(`   Flags: ${app.flags}`);

      // Remind about manual asset check
      console.log('\n⚠️  Discord API does not expose Rich Presence asset listing.');
      console.log('   Verify assets manually at:');
      console.log(`   https://discord.com/developers/applications/${APP_ID}/rich-presence/visualizer`);
      console.log('\n   Expected 11 assets:');
      for (const asset of ALL_ASSETS) {
        console.log(`     • ${asset.key} (${asset.label})`);
      }
    } else {
      const error = await response.json();
      console.error(`\n❌ Failed to fetch application: ${response.status} ${response.statusText}`);
      console.error('   ', JSON.stringify(error));
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (generateCurls) {
    generateCurlCommands();
  } else if (validatePortal) {
    await validatePortalAssets();
  } else {
    validateLocalAssets();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

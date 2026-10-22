#!/usr/bin/env node
// =============================================================================
// Khaaos Run — Discord Slash Command Registration Script | Devs Ph.D
// =============================================================================
// Registers /khaaos slash commands with Discord API v10.
// Can be run standalone without starting the bot.
//
// Usage:
//   node scripts/register-commands.js                # Guild commands (dev)
//   node scripts/register-commands.js --global        # Global commands (production)
//   node scripts/register-commands.js --delete        # Delete all guild commands
//   node scripts/register-commands.js --delete --global # Delete all global commands
//   node scripts/register-commands.js --list          # List registered commands
//
// Required env vars:
//   DISCORD_BOT_TOKEN       — Bot token from Developer Portal
//   DISCORD_APPLICATION_ID  — Application ID (= Client ID)
//   DISCORD_GUILD_ID        — Guild ID (required for guild commands)
// =============================================================================

import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

// ─── Validate env vars ───────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const APP_ID = process.env.DISCORD_APPLICATION_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN is not set. Set it in .env or environment.');
  process.exit(1);
}
if (!APP_ID) {
  console.error('❌ DISCORD_APPLICATION_ID is not set. Set it in .env or environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
const isGlobal = args.includes('--global');
const isDelete = args.includes('--delete');
const isList = args.includes('--list');

if (!isGlobal && !GUILD_ID) {
  console.error('❌ DISCORD_GUILD_ID is not set. Required for guild commands. Use --global for global commands.');
  process.exit(1);
}

// ─── Slash command definitions (mirrors bot.js) ──────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('khaaos')
    .setDescription('Khaaos Run commands')
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Shows server status (online players, active matches, region health)')
    )
    .addSubcommand((sub) =>
      sub
        .setName('ranked')
        .setDescription('Shows player ELO, rank, and win rate')
        .addStringOption((opt) =>
          opt.setName('player').setDescription('Player EOS ID or name').setRequired(true)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('tournament')
        .setDescription('Tournament commands')
        .addSubcommand((sub) =>
          sub.setName('list').setDescription('Shows active tournaments')
        )
        .addSubcommand((sub) =>
          sub
            .setName('info')
            .setDescription('Shows tournament bracket/standings')
            .addStringOption((opt) =>
              opt.setName('id').setDescription('Tournament ID').setRequired(true)
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('match')
        .setDescription('Shows match details (world, players, kills, time)')
        .addStringOption((opt) =>
          opt.setName('id').setDescription('Match ID').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('economy')
        .setDescription('Shows KRC balance (requires admin role)')
        .addStringOption((opt) =>
          opt.setName('player').setDescription('Player EOS ID or name').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('lookup')
        .setDescription('Links Discord user to EOS account info')
        .addUserOption((opt) =>
          opt.setName('discord_user').setDescription('Discord user to look up').setRequired(true)
        )
    ),
];

const commandJSON = commands.map((cmd) => cmd.toJSON());

// ─── REST client ─────────────────────────────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(TOKEN);

// ─── Commands ────────────────────────────────────────────────────────────────
async function registerCommands() {
  const scope = isGlobal ? 'global' : `guild ${GUILD_ID}`;
  console.log(`\n🚀 Registering ${commandJSON.length} command(s) for ${scope}...`);
  console.log(`   Application ID: ${APP_ID}`);
  if (!isGlobal) console.log(`   Guild ID: ${GUILD_ID}`);

  // Print command tree
  for (const cmd of commandJSON) {
    console.log(`   /${cmd.name}`);
    if (cmd.options) {
      for (const opt of cmd.options) {
        if (opt.type === 1) {
          // Subcommand
          console.log(`     ├─ ${opt.name} — ${opt.description}`);
        } else if (opt.type === 2) {
          // Subcommand group
          console.log(`     ├─ ${opt.name} (group)`);
          if (opt.options) {
            for (const sub of opt.options) {
              console.log(`     │  ├─ ${sub.name} — ${sub.description}`);
            }
          }
        }
      }
    }
  }

  try {
    const route = isGlobal
      ? Routes.applicationCommands(APP_ID)
      : Routes.applicationGuildCommands(APP_ID, GUILD_ID);

    const result = await rest.put(route, { body: commandJSON });
    console.log(`\n✅ Successfully registered ${result.length} command(s) for ${scope}.`);
  } catch (err) {
    console.error(`\n❌ Failed to register commands: ${err.message}`);
    if (err.rawError) {
      console.error('   Discord API error:', JSON.stringify(err.rawError, null, 2));
    }
    process.exit(1);
  }
}

async function deleteCommands() {
  const scope = isGlobal ? 'global' : `guild ${GUILD_ID}`;
  console.log(`\n🗑️  Deleting all commands for ${scope}...`);

  try {
    const route = isGlobal
      ? Routes.applicationCommands(APP_ID)
      : Routes.applicationGuildCommands(APP_ID, GUILD_ID);

    await rest.put(route, { body: [] });
    console.log(`✅ Successfully deleted all commands for ${scope}.`);
  } catch (err) {
    console.error(`❌ Failed to delete commands: ${err.message}`);
    process.exit(1);
  }
}

async function listCommands() {
  const scope = isGlobal ? 'global' : `guild ${GUILD_ID}`;
  console.log(`\n📋 Listing commands for ${scope}...`);

  try {
    const route = isGlobal
      ? Routes.applicationCommands(APP_ID)
      : Routes.applicationGuildCommands(APP_ID, GUILD_ID);

    const existing = await rest.get(route);

    if (existing.length === 0) {
      console.log('   No commands registered.');
      return;
    }

    for (const cmd of existing) {
      console.log(`   /${cmd.name} (ID: ${cmd.id})`);
      if (cmd.options) {
        for (const opt of cmd.options) {
          if (opt.type === 1) {
            console.log(`     ├─ ${opt.name}`);
          } else if (opt.type === 2) {
            console.log(`     ├─ ${opt.name} (group)`);
            if (opt.options) {
              for (const sub of opt.options) {
                console.log(`     │  ├─ ${sub.name}`);
              }
            }
          }
        }
      }
    }
    console.log(`\n   Total: ${existing.length} command(s)`);
  } catch (err) {
    console.error(`❌ Failed to list commands: ${err.message}`);
    process.exit(1);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Khaaos Run — Slash Command Registration');
  console.log('═══════════════════════════════════════════════════════');

  if (isList) {
    await listCommands();
  } else if (isDelete) {
    await deleteCommands();
  } else {
    await registerCommands();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

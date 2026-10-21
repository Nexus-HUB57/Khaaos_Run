/**
 * register-commands.js
 * Khaaos Run — Discord Slash Command Registration Script
 *
 * Standalone script to register/update slash commands with Discord.
 * Use this for initial setup or CI/CD pipeline registration.
 *
 * Usage:
 *   node register-commands.js                # Register guild commands
 *   node register-commands.js --global       # Register global commands
 *   node register-commands.js --validate     # Validate schema only (no registration)
 *
 * Discord API v10 Reference:
 *   - Command name: 1-32 lowercase chars, ^[a-z0-9_]+$
 *   - Description: 1-100 characters
 *   - Options: max 25 per command
 *   - Subcommands: max 25 per group
 *   - Total command size: max 8000 characters when serialized
 */

import 'dotenv/config';
import {
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

// ─── Command Definitions (must match bot.js) ───────────────────────────────

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

// ─── Validation ─────────────────────────────────────────────────────────────

function validateCommands(cmds) {
  const errors = [];
  const warnings = [];

  for (const cmd of cmds) {
    const json = cmd.toJSON();

    // Validate top-level command name
    if (!/^[a-z0-9_]+$/.test(json.name)) {
      errors.push(`Command name "${json.name}" must be lowercase alphanumeric + underscores`);
    }
    if (json.name.length > 32) {
      errors.push(`Command name "${json.name}" exceeds 32 chars (${json.name.length})`);
    }
    if (json.name.length < 1) {
      errors.push(`Command name is empty`);
    }

    // Validate description
    if (!json.description || json.description.length === 0) {
      errors.push(`Command "${json.name}" has empty description`);
    }
    if (json.description.length > 100) {
      errors.push(`Command "${json.name}" description exceeds 100 chars (${json.description.length})`);
    }

    // Validate subcommands and subcommand groups
    if (json.options) {
      if (json.options.length > 25) {
        errors.push(`Command "${json.name}" has >25 options (${json.options.length})`);
      }

      for (const opt of json.options) {
        if (opt.type === 2) { // SUB_COMMAND_GROUP
          if (!opt.options || opt.options.length === 0) {
            errors.push(`Subcommand group "${opt.name}" has no subcommands`);
          }
          if (opt.options.length > 25) {
            errors.push(`Subcommand group "${opt.name}" has >25 subcommands`);
          }
          for (const sub of opt.options || []) {
            if (!sub.description || sub.description.length === 0) {
              errors.push(`Subcommand "${opt.name} ${sub.name}" has empty description`);
            }
          }
        }
        if (opt.type === 1) { // SUB_COMMAND
          if (!opt.description || opt.description.length === 0) {
            errors.push(`Subcommand "${opt.name}" has empty description`);
          }
          if (opt.options && opt.options.length > 25) {
            errors.push(`Subcommand "${opt.name}" has >25 options`);
          }
        }
      }
    }

    // Validate total serialized size (max 8000 chars for complex commands)
    const serialized = JSON.stringify(json);
    if (serialized.length > 8000) {
      errors.push(`Command "${json.name}" serialized size exceeds 8000 chars (${serialized.length})`);
    }
  }

  return { errors, warnings };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isGlobal = args.includes('--global');
  const isValidate = args.includes('--validate');

  const token = process.env.DISCORD_BOT_TOKEN;
  const appId = process.env.DISCORD_APPLICATION_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  // ── Validate schema ──────────────────────────────────────────────
  console.log('Validating slash command schema...');
  const { errors, warnings } = validateCommands(commands);

  if (errors.length > 0) {
    console.error(`\n❌ ${errors.length} validation error(s):`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn(`\n⚠ ${warnings.length} validation warning(s):`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  console.log(`✅ ${commands.length} command(s) passed validation`);

  // Summarize command structure
  for (const cmd of commands) {
    const json = cmd.toJSON();
    console.log(`\n  /${json.name} — ${json.description}`);
    for (const opt of json.options || []) {
      if (opt.type === 2) { // SUB_COMMAND_GROUP
        console.log(`    ├── ${opt.name} (group) — ${opt.description}`);
        for (const sub of opt.options || []) {
          const reqOpts = (sub.options || []).filter(o => o.required).map(o => o.name);
          const optStr = reqOpts.length > 0 ? ` [${reqOpts.join(', ')}]` : '';
          console.log(`    │   ├── ${sub.name}${optStr} — ${sub.description}`);
        }
      } else if (opt.type === 1) { // SUB_COMMAND
        const reqOpts = (opt.options || []).filter(o => o.required).map(o => o.name);
        const optStr = reqOpts.length > 0 ? ` [${reqOpts.join(', ')}]` : '';
        console.log(`    ├── ${opt.name}${optStr} — ${opt.description}`);
      }
    }
  }

  if (isValidate) {
    console.log('\nValidation-only mode. Exiting.');
    process.exit(0);
  }

  // ── Register with Discord ────────────────────────────────────────
  if (!token) {
    console.error('DISCORD_BOT_TOKEN is not set. Cannot register commands.');
    process.exit(1);
  }
  if (!appId) {
    console.error('DISCORD_APPLICATION_ID is not set. Cannot register commands.');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const commandData = commands.map((cmd) => cmd.toJSON());

  try {
    if (isGlobal) {
      console.log('\nRegistering global commands...');
      await rest.put(Routes.applicationCommands(appId), { body: commandData });
      console.log(`✅ Registered ${commandData.length} global command(s)`);
    } else if (guildId) {
      console.log(`\nRegistering guild commands for guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commandData });
      console.log(`✅ Registered ${commandData.length} guild command(s)`);
    } else {
      console.error('Set DISCORD_GUILD_ID for guild commands or use --global for global commands.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Registration failed: ${err.message}`);
    if (err.rawError) {
      console.error('Discord API error:', JSON.stringify(err.rawError, null, 2));
    }
    process.exit(1);
  }
}

main();

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import winston from 'winston';
import axios from 'axios';

import { handleStatus } from './commands/status.js';
import { handleRanked } from './commands/ranked.js';
import { handleTournamentList, handleTournamentInfo } from './commands/tournament.js';
import { handleMatch } from './commands/match.js';

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------
export const COLORS = {
  SUCCESS: 0x00C853,
  ERROR:   0xFF1744,
  INFO:    0x2979FF,
  WARNING: 0xFF9100,
  RANKED:  0xAA00FF,
  TOURNAMENT: 0xFFD600,
  MATCH:   0x00BCD4,
  ECONOMY: 0x76FF03,
};

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
const api = axios.create({
  baseURL: process.env.KHAASOS_API_BASE || 'http://localhost:3001',
  headers: {
    'X-API-Key': process.env.KHAASOS_API_KEY || '',
  },
  timeout: 10000,
});

export { api, logger };

// ---------------------------------------------------------------------------
// Slash command definitions
// ---------------------------------------------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName('khaaos')
    .setDescription('Khaaos Run commands')
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Shows server status (online players, active matches, region health)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ranked')
        .setDescription('Shows player ELO, rank, and win rate')
        .addStringOption((opt) =>
          opt.setName('player').setDescription('Player EOS ID or name').setRequired(true),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('tournament')
        .setDescription('Tournament commands')
        .addSubcommand((sub) =>
          sub.setName('list').setDescription('Shows active tournaments'),
        )
        .addSubcommand((sub) =>
          sub
            .setName('info')
            .setDescription('Shows tournament bracket/standings')
            .addStringOption((opt) =>
              opt.setName('id').setDescription('Tournament ID').setRequired(true),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('match')
        .setDescription('Shows match details (world, players, kills, time)')
        .addStringOption((opt) =>
          opt.setName('id').setDescription('Match ID').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('economy')
        .setDescription('Shows KRC balance (requires admin role)')
        .addStringOption((opt) =>
          opt.setName('player').setDescription('Player EOS ID or name').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('lookup')
        .setDescription('Links Discord user to EOS account info')
        .addUserOption((opt) =>
          opt.setName('discord_user').setDescription('Discord user to look up').setRequired(true),
        ),
    ),
].map((cmd) => cmd.toJSON());

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

// ---------------------------------------------------------------------------
// Register slash commands on ready
// ---------------------------------------------------------------------------
client.once('ready', async () => {
  logger.info(`Connected as ${client.user.tag} (${client.user.id})`);
  client.user.setActivity('Khaaos Run | Online');

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  const guildId = process.env.DISCORD_GUILD_ID;

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
        body: commands,
      });
      logger.info(`Registered ${commands.length} slash commands for guild ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      logger.info(`Registered ${commands.length} global slash commands`);
    }
  } catch (err) {
    logger.error(`Failed to register slash commands: ${err.message}`);
  }

  // Start webhook polling for tournament/economy events
  startEventPolling();
  await refreshBetaEosIds();
});

// ---------------------------------------------------------------------------
// Interaction handler
// ---------------------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'khaaos') return;

  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  try {
    // Route to appropriate handler
    if (subcommand === 'status') {
      await handleStatus(interaction);
    } else if (subcommand === 'ranked') {
      await handleRanked(interaction);
    } else if (subcommandGroup === 'tournament' && subcommand === 'list') {
      await handleTournamentList(interaction);
    } else if (subcommandGroup === 'tournament' && subcommand === 'info') {
      await handleTournamentInfo(interaction);
    } else if (subcommand === 'match') {
      await handleMatch(interaction);
    } else if (subcommand === 'economy') {
      await handleEconomy(interaction);
    } else if (subcommand === 'lookup') {
      await handleLookup(interaction);
    }
  } catch (err) {
    logger.error(`Command error [${subcommandGroup || ''}/${subcommand}]: ${err.message}`);
    const errorEmbed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('Command Error')
      .setDescription(`An unexpected error occurred: \`${err.message}\``)
      .setTimestamp();
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyErr) {
      logger.error(`Failed to send error reply: ${replyErr.message}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Guild member add - welcome and beta role
// ---------------------------------------------------------------------------
const BETA_EOS_IDS = new Set();

// ── Populate BETA_EOS_IDS from API ──
async function refreshBetaEosIds() {
  try {
    const { data } = await api.get('/api/v1/discord-links/beta');
    if (Array.isArray(data)) {
      BETA_EOS_IDS.clear();
      for (const link of data) {
        if (link.eosId) BETA_EOS_IDS.add(link.eosId);
      }
      logger.info(`Refreshed BETA_EOS_IDS: ${BETA_EOS_IDS.size} beta testers`);
    }
  } catch {
    // Endpoint may not exist yet — fall back to empty set
    logger.info('Beta EOS IDs endpoint not available — BETA_EOS_IDS remains empty');
  }
}

client.on('guildMemberAdd', async (member) => {
  try {
    const welcomeChannel = member.guild.systemChannel;
    if (welcomeChannel) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle('Welcome to Khaaos Run')
        .setDescription(
          `Hey <@${member.id}>, welcome to the Khaaos Run Discord!\n` +
            `Use \`/khaaos ranked\` to check your stats or \`/khaaos tournament list\` to see active tournaments.`,
        )
        .setTimestamp();
      await welcomeChannel.send({ embeds: [embed] });
    }

    // Auto-assign beta role if member's linked EOS account is in the beta list
    const betaRoleId = process.env.DISCORD_BETA_ROLE_ID;
    if (betaRoleId && BETA_EOS_IDS.size > 0) {
      // Attempt to resolve EOS link for this Discord user
      try {
        const { data } = await api.get(`/api/v1/discord-link/${member.id}`);
        if (data?.eosId && BETA_EOS_IDS.has(data.eosId)) {
          await member.roles.add(betaRoleId);
          logger.info(`Assigned beta role to ${member.user.tag}`);
        }
      } catch {
        // No linked account - skip silently
      }
    }
  } catch (err) {
    logger.error(`guildMemberAdd error: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// /khaaos economy handler
// ---------------------------------------------------------------------------
async function handleEconomy(interaction) {
  // Check admin permission
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('Permission Denied')
      .setDescription('The `/khaaos economy` command requires Administrator permissions.')
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const player = interaction.options.getString('player');
  await interaction.deferReply();

  try {
    const { data } = await api.get(`/api/v1/economy/${encodeURIComponent(player)}`);
    const embed = new EmbedBuilder()
      .setColor(COLORS.ECONOMY)
      .setTitle(`Economy: ${data.playerName || player}`)
      .addFields(
        { name: 'KRC Balance', value: `${data.balance ?? 'N/A'}`, inline: true },
        { name: 'Lifetime Earned', value: `${data.lifetimeEarned ?? 'N/A'}`, inline: true },
        { name: 'Lifetime Spent', value: `${data.lifetimeSpent ?? 'N/A'}`, inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('Economy Lookup Failed')
      .setDescription(`Could not retrieve economy data for \`${player}\`: ${err.message}`)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
}

// ---------------------------------------------------------------------------
// /khaaos lookup handler
// ---------------------------------------------------------------------------
async function handleLookup(interaction) {
  const discordUser = interaction.options.getUser('discord_user');
  await interaction.deferReply();

  try {
    const { data } = await api.get(`/api/v1/discord-link/${discordUser.id}`);
    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(`Discord Link: ${discordUser.tag}`)
      .addFields(
        { name: 'Discord ID', value: discordUser.id, inline: true },
        { name: 'EOS ID', value: data.eosId || 'Not linked', inline: true },
        { name: 'Player Name', value: data.playerName || 'Unknown', inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    if (err.response?.status === 404) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('No Linked Account')
        .setDescription(`<@${discordUser.id}> does not have a linked EOS account.`)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('Lookup Failed')
      .setDescription(`Could not look up <@${discordUser.id}>: ${err.message}`)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
}

// ---------------------------------------------------------------------------
// Event polling - tournament bracket advances & economy alerts
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 30_000;
let lastTournamentStateHash = '';

async function startEventPolling() {
  setInterval(async () => {
    try {
      await pollTournamentEvents();
      await pollEconomyAlerts();
      await refreshBetaEosIds();
    } catch (err) {
      logger.error(`Event polling error: ${err.message}`);
    }
  }, POLL_INTERVAL_MS);
  logger.info(`Event polling started (interval: ${POLL_INTERVAL_MS}ms)`);
}

async function pollTournamentEvents() {
  const { data } = await api.get('/api/v1/tournament');
  const tournaments = Array.isArray(data) ? data : data.tournaments ?? [];
  const currentHash = JSON.stringify(tournaments.map((t) => ({ id: t.id, state: t.state, round: t.currentRound })));

  if (currentHash !== lastTournamentStateHash && lastTournamentStateHash !== '') {
    // Detect changes and post to tournament channel
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
    if (!guild) return;

    const tournamentChannel = guild.channels.cache.find(
      (ch) => ch.name === 'tournaments' && ch.isTextBased(),
    );
    if (!tournamentChannel) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.TOURNAMENT)
      .setTitle('Tournament Update')
      .setDescription('A tournament bracket has advanced. Check `/khaaos tournament list` for details.')
      .setTimestamp();
    await tournamentChannel.send({ embeds: [embed] });
    logger.info('Posted tournament bracket advance notification');
  }

  lastTournamentStateHash = currentHash;
}

async function pollEconomyAlerts() {
  try {
    const { data } = await api.get('/api/v1/economy/alerts');
    const alerts = Array.isArray(data) ? data : [];
    if (alerts.length === 0) return;

    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
    if (!guild) return;

    const economyChannel = guild.channels.cache.find(
      (ch) => ch.name === 'economy' && ch.isTextBased(),
    );
    if (!economyChannel) return;

    for (const alert of alerts.slice(0, 5)) {
      const embed = new EmbedBuilder()
        .setColor(alert.severity === 'critical' ? COLORS.ERROR : COLORS.WARNING)
        .setTitle(`Economy Alert: ${alert.type || 'Unknown'}`)
        .setDescription(alert.message || 'No details available.')
        .setTimestamp();
      await economyChannel.send({ embeds: [embed] });
    }
    logger.info(`Forwarded ${Math.min(alerts.length, 5)} economy alerts`);
  } catch {
    // Alerts endpoint may not exist yet - skip silently
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
if (!process.env.DISCORD_BOT_TOKEN) {
  logger.error('DISCORD_BOT_TOKEN is not set. Exiting.');
  process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);

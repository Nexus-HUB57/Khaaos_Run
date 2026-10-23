import { EmbedBuilder } from 'discord.js';
import { api, logger, COLORS } from '../bot.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTimeToNext(ms) {
  if (ms == null) return 'N/A';
  if (ms <= 0) return 'Starting now';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function stateLabel(state) {
  const labels = {
    registration: 'Registration Open',
    seeding:      'Seeding',
    in_progress:  'In Progress',
    completed:    'Completed',
    cancelled:    'Cancelled',
  };
  return labels[state] || state || 'Unknown';
}

// ---------------------------------------------------------------------------
// /khaaos tournament list
// ---------------------------------------------------------------------------
export async function handleTournamentList(interaction) {
  await interaction.deferReply();

  try {
    const { data } = await api.get('/api/v1/tournament');
    const tournaments = Array.isArray(data) ? data : data.tournaments ?? [];

    if (tournaments.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle('Tournaments')
        .setDescription('No active tournaments at this time.')
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.TOURNAMENT)
      .setTitle('Active Tournaments')
      .setDescription(
        tournaments
          .slice(0, 10)
          .map((t) => {
            const registered = t.registeredCount ?? 0;
            const max = t.maxParticipants ?? '?';
            const prize = t.prizePool ? ` | Prize: ${t.prizePool} KRC` : '';
            return `**${t.name || t.id}** - ${stateLabel(t.state)} (${registered}/${max})${prize}`;
          })
          .join('\n'),
      )
      .setFooter({ text: `Showing ${Math.min(tournaments.length, 10)} of ${tournaments.length}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error(`Tournament list error: ${err.message}`);
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('Tournament Lookup Failed')
      .setDescription(`Could not retrieve tournaments: \`${err.message}\``)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
}

// ---------------------------------------------------------------------------
// /khaaos tournament info <id>
// ---------------------------------------------------------------------------
export async function handleTournamentInfo(interaction) {
  const tournamentId = interaction.options.getString('id');
  await interaction.deferReply();

  try {
    const { data } = await api.get(`/api/v1/tournament/${encodeURIComponent(tournamentId)}`);

    const registered = data.registeredCount ?? 0;
    const max = data.maxParticipants ?? '?';
    const currentRound = data.currentRound ?? 'N/A';
    const prizePool = data.prizePool != null ? `${data.prizePool} KRC` : 'N/A';
    const timeToNext = formatTimeToNext(data.timeToNextPhase);

    const embed = new EmbedBuilder()
      .setColor(COLORS.TOURNAMENT)
      .setTitle(`Tournament: ${data.name || tournamentId}`)
      .addFields(
        { name: 'State', value: stateLabel(data.state), inline: true },
        { name: 'Registered', value: `${registered}/${max}`, inline: true },
        { name: 'Current Round', value: `${currentRound}`, inline: true },
        { name: 'Prize Pool', value: prizePool, inline: true },
        { name: 'Time to Next Phase', value: timeToNext, inline: true },
      );

    // Add bracket/standings if available
    if (data.standings && data.standings.length > 0) {
      const standingsText = data.standings
        .slice(0, 10)
        .map((s, i) => `${i + 1}. ${s.playerName || s.eosId} - ${s.wins}W/${s.losses}L`)
        .join('\n');
      embed.addFields({ name: 'Standings (Top 10)', value: standingsText, inline: false });
    }

    if (data.bracketUrl) {
      embed.addFields({ name: 'Bracket', value: `[View Bracket](${data.bracketUrl})`, inline: false });
    }

    embed.setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error(`Tournament info error: ${err.message}`);
    if (err.response?.status === 404) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('Tournament Not Found')
        .setDescription(`No tournament found with ID \`${tournamentId}\`.`)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('Tournament Lookup Failed')
      .setDescription(`Could not retrieve tournament \`${tournamentId}\`: ${err.message}`)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
}

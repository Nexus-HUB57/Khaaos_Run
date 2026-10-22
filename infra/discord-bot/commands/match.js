import { EmbedBuilder } from 'discord.js';
import { api, logger, COLORS } from '../bot.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatElapsed(seconds) {
  if (seconds == null) return 'N/A';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

function circlePhaseLabel(phase) {
  const labels = {
    0: 'Pre-Circle',
    1: 'Circle 1 - Closing',
    2: 'Circle 2 - Closing',
    3: 'Circle 3 - Closing',
    4: 'Circle 4 - Closing',
    5: 'Final Circle',
  };
  if (phase == null) return 'N/A';
  return labels[phase] || `Circle ${phase}`;
}

// ---------------------------------------------------------------------------
// /khaaos match <id>
// ---------------------------------------------------------------------------
export async function handleMatch(interaction) {
  const matchId = interaction.options.getString('id');
  await interaction.deferReply();

  try {
    const { data } = await api.get(`/api/v1/match/${encodeURIComponent(matchId)}`);

    const aliveCount = data.aliveCount ?? 'N/A';
    const timeElapsed = formatElapsed(data.timeElapsed);
    const phase = circlePhaseLabel(data.circlePhase);

    const embed = new EmbedBuilder()
      .setColor(COLORS.MATCH)
      .setTitle(`Match: ${data.id || matchId}`)
      .addFields(
        { name: 'World', value: data.world || 'N/A', inline: true },
        { name: 'Alive', value: `${aliveCount}`, inline: true },
        { name: 'Circle Phase', value: phase, inline: true },
        { name: 'Time Elapsed', value: timeElapsed, inline: true },
      );

    // Kill feed - top 5
    if (data.killFeed && data.killFeed.length > 0) {
      const killFeedText = data.killFeed
        .slice(0, 5)
        .map((entry, i) => {
          const killer = entry.killerName || entry.killer || '???';
          const victim = entry.victimName || entry.victim || '???';
          const weapon = entry.weapon ? ` [${entry.weapon}]` : '';
          return `${i + 1}. ${killer} -> ${victim}${weapon}`;
        })
        .join('\n');
      embed.addFields({ name: 'Kill Feed (Top 5)', value: killFeedText, inline: false });
    }

    // Players list if available
    if (data.players && data.players.length > 0) {
      const playersText = data.players
        .slice(0, 10)
        .map((p) => `${p.name || p.eosId} (${p.kills ?? 0} kills)`)
        .join('\n');
      embed.addFields({ name: 'Players (Top 10)', value: playersText, inline: false });
    }

    embed.setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error(`Match command error: ${err.message}`);
    if (err.response?.status === 404) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('Match Not Found')
        .setDescription(`No match found with ID \`${matchId}\`.`)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('Match Lookup Failed')
      .setDescription(`Could not retrieve match \`${matchId}\`: ${err.message}`)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
}

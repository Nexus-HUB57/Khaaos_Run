import { EmbedBuilder } from 'discord.js';
import { api, logger, COLORS } from '../bot.js';

// ---------------------------------------------------------------------------
// /khaaos status
// ---------------------------------------------------------------------------
export async function handleStatus(interaction) {
  await interaction.deferReply();

  try {
    const { data } = await api.get('/api/v1/server/status');

    // Build region health lines
    let regionLines = 'No region data';
    if (data.regions && Object.keys(data.regions).length > 0) {
      regionLines = Object.entries(data.regions)
        .map(([region, info]) => {
          const status = info.healthy ? 'Healthy' : 'Degraded';
          const players = info.players ?? 0;
          return `**${region}**: ${status} (${players} players)`;
        })
        .join('\n');
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle('Khaaos Run - Server Status')
      .addFields(
        { name: 'Online Players', value: `${data.onlinePlayers ?? 'N/A'}`, inline: true },
        { name: 'Active Matches', value: `${data.activeMatches ?? 'N/A'}`, inline: true },
        { name: 'Uptime', value: data.uptime ?? 'N/A', inline: true },
        { name: 'Version', value: data.version ?? 'N/A', inline: true },
      )
      .addFields({ name: 'Regions', value: regionLines, inline: false })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error(`Status command error: ${err.message}`);
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('Server Status Unavailable')
      .setDescription(`Could not retrieve server status: \`${err.message}\``)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
}

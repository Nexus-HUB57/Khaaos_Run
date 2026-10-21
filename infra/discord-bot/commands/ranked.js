import { EmbedBuilder } from 'discord.js';
import { api, logger, COLORS } from '../bot.js';

// ---------------------------------------------------------------------------
// Rank tiers
// ---------------------------------------------------------------------------
const RANK_TIERS = [
  { name: 'Grandmaster', min: 2400, color: 0xFF1744 },
  { name: 'Master',      min: 2000, color: 0xD500F9 },
  { name: 'Diamond',     min: 1600, color: 0x00BCD4 },
  { name: 'Platinum',    min: 1200, color: 0x00E5FF },
  { name: 'Gold',        min: 800,  color: 0xFFD600 },
  { name: 'Silver',      min: 400,  color: 0xBDBDBD },
  { name: 'Bronze',      min: 0,    color: 0x8D6E63 },
];

function getRankTier(elo) {
  for (const tier of RANK_TIERS) {
    if (elo >= tier.min) return tier;
  }
  return RANK_TIERS[RANK_TIERS.length - 1];
}

// ---------------------------------------------------------------------------
// /khaaos ranked <player>
// ---------------------------------------------------------------------------
export async function handleRanked(interaction) {
  const player = interaction.options.getString('player');
  await interaction.deferReply();

  try {
    const { data } = await api.get(`/api/v1/ranked/${encodeURIComponent(player)}`);
    const elo = data.elo ?? 0;
    const tier = getRankTier(elo);
    const rankLabel = data.rank || tier.name;
    const winRate = data.winRate != null ? `${(data.winRate * 100).toFixed(1)}%` : 'N/A';

    const embed = new EmbedBuilder()
      .setColor(tier.color)
      .setTitle(`Ranked Profile: ${data.playerName || player}`)
      .addFields(
        { name: 'ELO', value: `${elo}`, inline: true },
        { name: 'Rank', value: rankLabel, inline: true },
        { name: 'Win Rate', value: winRate, inline: true },
        { name: 'Matches Played', value: `${data.matchesPlayed ?? 'N/A'}`, inline: true },
        { name: 'Best Kill Streak', value: `${data.bestKillStreak ?? 'N/A'}`, inline: true },
      )
      .setFooter({ text: `Tier: ${tier.name} (${tier.min}+ ELO)` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error(`Ranked command error: ${err.message}`);
    if (err.response?.status === 404) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('Player Not Found')
        .setDescription(`No ranked data found for \`${player}\`.`)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('Ranked Lookup Failed')
      .setDescription(`Could not retrieve ranked data for \`${player}\`: ${err.message}`)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
}

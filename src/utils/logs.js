const { EmbedBuilder } = require("discord.js");
const { getGuildConfig } = require("../database/guildStore");
const { normalizeColor, safeChannel } = require("./discord");

function logEmbed(title, description, color = "#2B6CFF") {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(normalizeColor(String(color)))
    .setTimestamp();
}

function guildEmbed(guild, title, description, color = null) {
  const config = getGuildConfig(guild.id);
  return logEmbed(title, description, color || config.menuColor);
}

async function sendLog(guild, type, embed) {
  const config = getGuildConfig(guild.id);
  const aliases = {
    joinLeave: config.logs.memberJoin || config.logs.memberLeave,
    voice: config.logs.voiceTraffic,
    messages: config.logs.messageDelete || config.logs.messageUpdate,
    security: config.logs.security,
    basic: config.logs.basic
  };
  const channelId = config.logs[type] || aliases[type] || (type === "ticket" ? config.ticket.logChannelId : null) || config.logs.basic;
  const channel = safeChannel(guild, channelId);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = {
  guildEmbed,
  logEmbed,
  sendLog
};

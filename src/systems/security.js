const { PermissionsBitField } = require("discord.js");
const { sendLog, userLogEmbed } = require("../utils/logs");

const spamMap = new Map();

async function runMessageSecurity(message, config) {
  const s = config.security;
  if (!s.enabled || message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return;

  const content = message.content.toLowerCase();
  const hasLink = /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/)/i.test(content);

  if (s.antiLinks && hasLink) {
    await applySecurityAction(message, s, "Anti links");
    await message.channel
      .send(`${message.author}, links nao sao permitidos.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => null), 5000))
      .catch(() => null);
    return sendLog(message.guild, "security", userLogEmbed("Anti links", message.member || message.author, [
      `Canal: ${message.channel}`,
      "Acao: **mensagem removida**"
    ], 0xff4d4f));
  }

  if (s.antiEveryone && (message.mentions.everyone || content.includes("@everyone") || content.includes("@here"))) {
    await applySecurityAction(message, s, "Anti everyone/here");
    return sendLog(message.guild, "security", userLogEmbed("Anti everyone/here", message.member || message.author, [
      `Canal: ${message.channel}`,
      "Acao: **tentou mencionar everyone/here**"
    ], 0xff4d4f));
  }

  if (s.antiSpam) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const data = spamMap.get(key) || [];
    const windowMs = Math.max(2, Number(s.spamWindowSeconds) || 6) * 1000;
    const recent = data.filter(time => now - time < windowMs);
    recent.push(now);
    spamMap.set(key, recent);

    if (recent.length >= Math.max(2, Number(s.spamLimit) || 6)) {
      await applySecurityAction(message, s, "Anti spam");
      spamMap.set(key, []);
      return sendLog(message.guild, "security", userLogEmbed("Anti spam", message.member || message.author, [
        `Canal: ${message.channel}`,
        `Acao: **${s.observeOnly ? "observar" : s.action || "timeout"}**`
      ], 0xff4d4f));
    }
  }
}

async function applySecurityAction(message, settings, reason) {
  if (settings.observeOnly) return;
  const action = settings.action || "timeout";
  if (["delete", "timeout", "kick", "ban"].includes(action)) {
    await message.delete().catch(() => null);
  }
  if (action === "timeout") {
    await message.member.timeout(Math.max(5, Number(settings.timeoutSeconds) || 60) * 1000, reason).catch(() => null);
  }
  if (action === "kick") {
    await message.member.kick(reason).catch(() => null);
  }
  if (action === "ban") {
    await message.member.ban({ reason }).catch(() => null);
  }
}

module.exports = {
  runMessageSecurity
};

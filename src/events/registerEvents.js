const { AuditLogEvent } = require("discord.js");
const { getGuildConfig } = require("../database/guildStore");
const { saveGuildConfig } = require("../database/guildStore");
const { handleInteractionCreate } = require("../handlers/interactions");
const { handleMessageCreate } = require("../handlers/commands");
const { logEmbed, sendLog, userLogEmbed } = require("../utils/logs");
const { updateBotPresence } = require("../utils/presence");
const { startCall24hAutoReconnect } = require("../systems/call24h");

function registerEvents(client) {
  client.once("clientReady", () => {
    const firstGuild = client.guilds.cache.first();
    const config = firstGuild ? getGuildConfig(firstGuild.id) : { prefix: "nt!" };
    updateBotPresence(client, config.prefix);
    startAutoMessages(client);
    startCall24hAutoReconnect(client);
    console.log(`Online como ${client.user.tag}`);
  });

  client.on("messageCreate", handleMessageCreate);
  client.on("interactionCreate", handleInteractionCreate);
  client.on("error", error => console.error("Erro no cliente Discord:", error));
  client.on("shardError", error => console.error("Erro no shard Discord:", error));

  client.on("guildMemberAdd", async (member) => {
    const config = getGuildConfig(member.guild.id);
    if (member.user.bot && config.security.enabled && config.security.antiBotJoin) {
      await member.kick("Anti bot join Nox Tweaks").catch(() => null);
      await sendLog(member.guild, "antiBot", userLogEmbed("Anti bot join", member, [
        "Acao: **bot expulso automaticamente**"
      ], config.menuColor));
      return;
    }

    const autoRoleId = member.user.bot ? config.autoRole.botRoleId : config.autoRole.roleId;
    if (config.autoRole.enabled && autoRoleId && (!member.user.bot || config.autoRole.includeBots || config.autoRole.botRoleId)) {
      const role = member.guild.roles.cache.get(autoRoleId);
      if (role) {
        await member.roles.add(role, "Autocargo Nox Tweaks")
          .then(() => sendLog(member.guild, "roleAdd", userLogEmbed("Autocargo aplicado", member, [`Cargo: ${role}`], config.menuColor)))
          .catch(() => sendLog(member.guild, "roleAdd", userLogEmbed("Falha no autocargo", member, [
            `Cargo: ${role}`,
            "Verifique minha permissao e hierarquia."
          ], config.menuColor)));
      }
    }

    if (config.welcome?.enabled && config.welcome.channelId) {
      const channel = member.guild.channels.cache.get(config.welcome.channelId);
      if (channel?.isTextBased()) {
        const text = formatWelcome(config.welcome.message, member);
        const embed = logEmbed("Bem-vindo", text, config.menuColor);
        if (config.welcome.image) embed.setImage(config.welcome.image);
        const payload = config.welcome.mode === "Embed"
          ? { embeds: [embed] }
          : { content: text };
        const sent = await channel.send(payload).catch(() => null);
        const deleteAfter = Number(config.welcome.deleteAfter) || 0;
        if (sent && deleteAfter > 0) setTimeout(() => sent.delete().catch(() => null), deleteAfter * 1000);
      }
    }

    if (config.welcome?.dmEnabled) {
      await member.send({ content: formatWelcome(config.welcome.message, member) }).catch(() => null);
    }

    await sendLog(member.guild, "memberJoin", userLogEmbed("Membro entrou", member, [
      "Acao: **entrou no servidor**",
      `Conta criada: <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`
    ], config.menuColor));
  });

  client.on("guildMemberRemove", async (member) => {
    const config = getGuildConfig(member.guild.id);
    await sendLog(member.guild, "memberLeave", userLogEmbed("Membro saiu", member, [
      "Acao: **saiu do servidor**",
      member.joinedTimestamp ? `Entrou no servidor: <t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : null
    ], config.menuColor));
  });

  client.on("voiceStateUpdate", async (oldState, newState) => {
    if (!oldState.channelId && newState.channelId) {
      const config = getGuildConfig(newState.guild.id);
      return sendLog(newState.guild, "voiceTraffic", userLogEmbed("Entrou em call", newState.member, [
        `Canal: <#${newState.channelId}>`,
        `Entrada: <t:${Math.floor(Date.now() / 1000)}:T>`
      ], config.menuColor));
    }
    if (oldState.channelId && !newState.channelId) {
      const config = getGuildConfig(oldState.guild.id);
      return sendLog(oldState.guild, "voiceTraffic", userLogEmbed("Saiu de call", oldState.member, [
        `Canal: <#${oldState.channelId}>`,
        `Saida: <t:${Math.floor(Date.now() / 1000)}:T>`
      ], config.menuColor));
    }
    if (oldState.channelId !== newState.channelId) {
      const config = getGuildConfig(newState.guild.id);
      return sendLog(newState.guild, "voiceTraffic", userLogEmbed("Moveu de call", newState.member, [
        `Antes: <#${oldState.channelId}>`,
        `Depois: <#${newState.channelId}>`,
        `Horario: <t:${Math.floor(Date.now() / 1000)}:T>`
      ], config.menuColor));
    }
  });

  client.on("messageDelete", async (message) => {
    if (!message.guild || message.partial || !message.author || message.author.bot) return;
    const config = getGuildConfig(message.guild.id);
    await sendLog(message.guild, "messageDelete", userLogEmbed("Mensagem apagada", message.member || message.author, [
      `Canal: ${message.channel}`,
      `Conteudo: ${message.cleanContent ? `\`${message.cleanContent.slice(0, 900)}\`` : "`sem conteudo`"}`
    ], config.menuColor));
  });

  client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (!newMessage.guild || oldMessage.partial || newMessage.partial) return;
    const author = newMessage.author || oldMessage.author;
    if (!author || author.bot) return;

    const before = oldMessage.cleanContent || oldMessage.content || "";
    const after = newMessage.cleanContent || newMessage.content || "";
    if (!before && !after) return;
    if (before === after) return;

    const config = getGuildConfig(newMessage.guild.id);
    await sendLog(newMessage.guild, "messageUpdate", userLogEmbed("Mensagem editada", newMessage.member || author, [
      `Canal: ${newMessage.channel}`,
      `Antes: ${before ? `\`${before.slice(0, 500)}\`` : "`vazio`"}`,
      `Depois: ${after ? `\`${after.slice(0, 500)}\`` : "`vazio`"}`
    ], config.menuColor));
  });

  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    const config = getGuildConfig(message.guild.id);
    if (config.autoReactions?.enabled) {
      for (const item of config.autoReactions.items || []) {
        if (item.channelId && item.channelId !== message.channel.id) continue;
        for (const emoji of item.emojis || []) await message.react(emoji).catch(() => null);
      }
    }
    if (config.userReactions?.enabled) {
      const allowedChannels = config.userReactions.channels || [];
      const emojis = config.userReactions.users?.[message.author.id] || [];
      if (emojis.length && (!allowedChannels.length || allowedChannels.includes(message.channel.id))) {
        for (const emoji of emojis) await message.react(emoji).catch(() => null);
      }
    }
  });

  client.on("channelDelete", async (channel) => {
    const config = getGuildConfig(channel.guild.id);
    const executor = await findAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const embed = executor
      ? userLogEmbed("Canal deletado", executor, [`Canal: \`${channel.name}\``, `ID canal: \`${channel.id}\``], config.menuColor)
      : logEmbed("Canal deletado", `Canal \`${channel.name}\` foi deletado.\nID: \`${channel.id}\`\nVerifique auditoria do servidor.`, config.menuColor);
    await sendLog(channel.guild, "channelDelete", embed);
  });

  client.on("roleDelete", async (role) => {
    const config = getGuildConfig(role.guild.id);
    const executor = await findAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    const embed = executor
      ? userLogEmbed("Cargo deletado", executor, [`Cargo: \`${role.name}\``, `ID cargo: \`${role.id}\``], config.menuColor)
      : logEmbed("Cargo deletado", `Cargo \`${role.name}\` foi deletado.\nID: \`${role.id}\`\nVerifique auditoria do servidor.`, config.menuColor);
    await sendLog(role.guild, "roleDelete", embed);
  });

  client.on("channelCreate", async (channel) => {
    const config = getGuildConfig(channel.guild.id);
    const executor = await findAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    const embed = executor
      ? userLogEmbed("Canal criado", executor, [`Canal: ${channel}`, `ID canal: \`${channel.id}\``], config.menuColor)
      : logEmbed("Canal criado", `Canal ${channel} foi criado.\nID: \`${channel.id}\``, config.menuColor);
    await sendLog(channel.guild, "channelCreate", embed);
  });

  client.on("channelUpdate", async (oldChannel, newChannel) => {
    const config = getGuildConfig(newChannel.guild.id);
    const executor = await findAuditExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    const embed = executor
      ? userLogEmbed("Canal atualizado", executor, [
        `Canal: ${newChannel}`,
        `ID canal: \`${newChannel.id}\``,
        `Antes: \`${oldChannel.name}\``,
        `Depois: \`${newChannel.name}\``
      ], config.menuColor)
      : logEmbed("Canal atualizado", `Canal ${newChannel} foi atualizado.\nAntes: \`${oldChannel.name}\`\nDepois: \`${newChannel.name}\``, config.menuColor);
    await sendLog(newChannel.guild, "channelUpdate", embed);
  });

  client.on("roleCreate", async (role) => {
    const config = getGuildConfig(role.guild.id);
    const executor = await findAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    const embed = executor
      ? userLogEmbed("Cargo criado", executor, [`Cargo: ${role}`, `ID cargo: \`${role.id}\``], config.menuColor)
      : logEmbed("Cargo criado", `Cargo ${role} foi criado.\nID: \`${role.id}\``, config.menuColor);
    await sendLog(role.guild, "roleCreate", embed);
  });

  client.on("roleUpdate", async (oldRole, newRole) => {
    const config = getGuildConfig(newRole.guild.id);
    const executor = await findAuditExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    const embed = executor
      ? userLogEmbed("Cargo atualizado", executor, [
        `Cargo: ${newRole}`,
        `ID cargo: \`${newRole.id}\``,
        `Antes: \`${oldRole.name}\``,
        `Depois: \`${newRole.name}\``
      ], config.menuColor)
      : logEmbed("Cargo atualizado", `Cargo ${newRole} foi atualizado.\nAntes: \`${oldRole.name}\`\nDepois: \`${newRole.name}\``, config.menuColor);
    await sendLog(newRole.guild, "roleUpdate", embed);
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const config = getGuildConfig(newMember.guild.id);
    const added = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removed = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
    for (const role of added.values()) {
      await sendLog(newMember.guild, "roleAdd", userLogEmbed("Cargo adicionado", newMember, [`Cargo: ${role}`], config.menuColor));
    }
    for (const role of removed.values()) {
      await sendLog(newMember.guild, "roleRemove", userLogEmbed("Cargo removido", newMember, [`Cargo: ${role}`], config.menuColor));
    }
    if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
      await sendLog(newMember.guild, "muteText", userLogEmbed("Membro silenciado", newMember, [
        `Ate: <t:${Math.floor(newMember.communicationDisabledUntil.getTime() / 1000)}:F>`
      ], config.menuColor));
    }
    if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil) {
      await sendLog(newMember.guild, "muteText", userLogEmbed("Silenciamento removido", newMember, [
        "Acao: **timeout removido**"
      ], config.menuColor));
    }
    if (!oldMember.premiumSince && newMember.premiumSince && config.autoRole.enabled && config.autoRole.boosterRoleId) {
      const role = newMember.guild.roles.cache.get(config.autoRole.boosterRoleId);
      if (role) await newMember.roles.add(role, "Autocargo booster Nox Tweaks").catch(() => null);
    }
    if (!oldMember.premiumSince && newMember.premiumSince) {
      await sendLog(newMember.guild, "basic", userLogEmbed("Novo boost no servidor", newMember, [
        "Acao: **impulsionou o servidor**",
        `Boost desde: <t:${Math.floor(newMember.premiumSinceTimestamp / 1000)}:F>`
      ], "#ff73c7"));
    }
  });

  client.on("guildBanAdd", async (ban) => {
    const config = getGuildConfig(ban.guild.id);
    if (config.security.enabled && config.security.antiBan) {
      await ban.guild.members.unban(ban.user.id, "Anti ban Nox Tweaks").catch(() => null);
      await sendLog(ban.guild, "ban", userLogEmbed("Anti ban", ban.user, [
        "Acao: **usuario desbanido automaticamente**",
        "Verifique auditoria do servidor."
      ], config.menuColor));
    } else {
      await sendLog(ban.guild, "ban", userLogEmbed("Usuario banido", ban.user, [
        "Acao: **banido do servidor**"
      ], config.menuColor));
    }
  });

  client.on("guildBanRemove", async (ban) => {
    const config = getGuildConfig(ban.guild.id);
    await sendLog(ban.guild, "unban", userLogEmbed("Usuario desbanido", ban.user, [
      "Acao: **desbanido do servidor**"
    ], config.menuColor));
  });
}

function startAutoMessages(client) {
  if (client.__noxAutoMessagesStarted) return;
  client.__noxAutoMessagesStarted = true;
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      const config = getGuildConfig(guild.id);
      if (!config.autoMessages?.enabled) continue;
      const now = Date.now();
      for (const item of config.autoMessages.items || []) {
        if (!item.enabled) continue;
        const intervalMs = Math.max(1, Number(item.intervalMinutes) || 60) * 60_000;
        if (item.lastSentAt && now - item.lastSentAt < intervalMs) continue;
        const channel = guild.channels.cache.get(item.channelId);
        if (!channel?.isTextBased()) continue;
        const payload = item.mode === "embed"
          ? { embeds: [logEmbed("Mensagem automatica", item.message, config.menuColor)] }
          : { content: item.message };
        const sent = await channel.send(payload).catch(() => null);
        if (sent) {
          saveGuildConfig(guild.id, cfg => {
            const saved = cfg.autoMessages.items.find(entry => entry.id === item.id);
            if (saved) saved.lastSentAt = now;
          });
        }
      }
    }
  }, 60_000);
}

function formatWelcome(template, member) {
  return String(template || "Bem-vindo {member} ao {servername}!")
    .replaceAll("{member}", `${member}`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{servername}", member.guild.name);
}

async function findAuditExecutor(guild, type, targetId) {
  const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
  const entry = logs?.entries?.find(item => {
    const target = item.target;
    return !targetId || target?.id === targetId;
  });
  return entry?.executor || null;
}

module.exports = {
  registerEvents
};

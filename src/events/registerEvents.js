const { getGuildConfig } = require("../database/guildStore");
const { saveGuildConfig } = require("../database/guildStore");
const { handleInteractionCreate } = require("../handlers/interactions");
const { handleMessageCreate } = require("../handlers/commands");
const { logEmbed, sendLog } = require("../utils/logs");
const { updateBotPresence } = require("../utils/presence");
const { startCall24hAutoReconnect } = require("../systems/call24h");

function registerEvents(client) {
  client.once("clientReady", () => {
    const firstGuild = client.guilds.cache.first();
    const config = firstGuild ? getGuildConfig(firstGuild.id) : { prefix: "x" };
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
      await sendLog(member.guild, "antiBot", logEmbed("Anti bot join", `Bot ${member.user.tag} foi expulso automaticamente.`, config.menuColor));
      return;
    }

    const autoRoleId = member.user.bot ? config.autoRole.botRoleId : config.autoRole.roleId;
    if (config.autoRole.enabled && autoRoleId && (!member.user.bot || config.autoRole.includeBots || config.autoRole.botRoleId)) {
      const role = member.guild.roles.cache.get(autoRoleId);
      if (role) {
        await member.roles.add(role, "Autocargo Nox Tweaks")
          .then(() => sendLog(member.guild, "roleAdd", logEmbed("Autocargo aplicado", `${member.user.tag} recebeu o cargo ${role}.`, config.menuColor)))
          .catch(() => sendLog(member.guild, "roleAdd", logEmbed("Falha no autocargo", `Nao consegui dar o cargo ${role} para ${member.user.tag}. Verifique minha permissao e hierarquia.`, config.menuColor)));
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

    await sendLog(member.guild, "memberJoin", logEmbed("Membro entrou", `${member.user.tag} entrou no servidor.`, config.menuColor));
  });

  client.on("guildMemberRemove", async (member) => {
    const config = getGuildConfig(member.guild.id);
    await sendLog(member.guild, "memberLeave", logEmbed("Membro saiu", `${member.user.tag} saiu do servidor.`, config.menuColor));
  });

  client.on("voiceStateUpdate", async (oldState, newState) => {
    if (!oldState.channelId && newState.channelId) {
      const config = getGuildConfig(newState.guild.id);
      return sendLog(newState.guild, "voiceTraffic", logEmbed("Entrou em call", `${newState.member.user.tag} entrou em <#${newState.channelId}>.`, config.menuColor));
    }
    if (oldState.channelId && !newState.channelId) {
      const config = getGuildConfig(oldState.guild.id);
      return sendLog(oldState.guild, "voiceTraffic", logEmbed("Saiu de call", `${oldState.member.user.tag} saiu de <#${oldState.channelId}>.`, config.menuColor));
    }
    if (oldState.channelId !== newState.channelId) {
      const config = getGuildConfig(newState.guild.id);
      return sendLog(newState.guild, "voiceTraffic", logEmbed("Moveu de call", `${newState.member.user.tag} saiu de <#${oldState.channelId}> e foi para <#${newState.channelId}>.`, config.menuColor));
    }
  });

  client.on("messageDelete", async (message) => {
    if (!message.guild || message.author?.bot) return;
    const config = getGuildConfig(message.guild.id);
    await sendLog(message.guild, "messageDelete", logEmbed("Mensagem apagada", `Autor: ${message.author}\nCanal: ${message.channel}\nConteudo: ${message.cleanContent || "(sem conteudo)"}`, config.menuColor));
  });

  client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (!oldMessage.guild || oldMessage.author?.bot || oldMessage.cleanContent === newMessage.cleanContent) return;
    const config = getGuildConfig(oldMessage.guild.id);
    await sendLog(oldMessage.guild, "messageUpdate", logEmbed("Mensagem editada", `Autor: ${oldMessage.author}\nCanal: ${oldMessage.channel}\nAntes: ${oldMessage.cleanContent || "(vazio)"}\nDepois: ${newMessage.cleanContent || "(vazio)"}`, config.menuColor));
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
    await sendLog(channel.guild, "channelDelete", logEmbed("Canal deletado", `Canal \`${channel.name}\` foi deletado. Verifique auditoria do servidor.`, config.menuColor));
  });

  client.on("roleDelete", async (role) => {
    const config = getGuildConfig(role.guild.id);
    await sendLog(role.guild, "roleDelete", logEmbed("Cargo deletado", `Cargo \`${role.name}\` foi deletado. Verifique auditoria do servidor.`, config.menuColor));
  });

  client.on("channelCreate", async (channel) => {
    const config = getGuildConfig(channel.guild.id);
    await sendLog(channel.guild, "channelCreate", logEmbed("Canal criado", `Canal ${channel} foi criado.`, config.menuColor));
  });

  client.on("channelUpdate", async (oldChannel, newChannel) => {
    const config = getGuildConfig(newChannel.guild.id);
    await sendLog(newChannel.guild, "channelUpdate", logEmbed("Canal atualizado", `Canal ${newChannel} foi atualizado.\nAntes: \`${oldChannel.name}\`\nDepois: \`${newChannel.name}\``, config.menuColor));
  });

  client.on("roleCreate", async (role) => {
    const config = getGuildConfig(role.guild.id);
    await sendLog(role.guild, "roleCreate", logEmbed("Cargo criado", `Cargo ${role} foi criado.`, config.menuColor));
  });

  client.on("roleUpdate", async (oldRole, newRole) => {
    const config = getGuildConfig(newRole.guild.id);
    await sendLog(newRole.guild, "roleUpdate", logEmbed("Cargo atualizado", `Cargo ${newRole} foi atualizado.\nAntes: \`${oldRole.name}\`\nDepois: \`${newRole.name}\``, config.menuColor));
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const config = getGuildConfig(newMember.guild.id);
    const added = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removed = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
    for (const role of added.values()) {
      await sendLog(newMember.guild, "roleAdd", logEmbed("Cargo adicionado", `${newMember.user.tag} recebeu ${role}.`, config.menuColor));
    }
    for (const role of removed.values()) {
      await sendLog(newMember.guild, "roleRemove", logEmbed("Cargo removido", `${newMember.user.tag} perdeu ${role}.`, config.menuColor));
    }
    if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
      await sendLog(newMember.guild, "muteText", logEmbed("Membro silenciado", `${newMember.user.tag} foi silenciado no chat.`, config.menuColor));
    }
    if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil) {
      await sendLog(newMember.guild, "muteText", logEmbed("Silenciamento removido", `${newMember.user.tag} teve o silenciamento removido.`, config.menuColor));
    }
    if (!oldMember.premiumSince && newMember.premiumSince && config.autoRole.enabled && config.autoRole.boosterRoleId) {
      const role = newMember.guild.roles.cache.get(config.autoRole.boosterRoleId);
      if (role) await newMember.roles.add(role, "Autocargo booster Nox Tweaks").catch(() => null);
    }
  });

  client.on("guildBanAdd", async (ban) => {
    const config = getGuildConfig(ban.guild.id);
    if (config.security.enabled && config.security.antiBan) {
      await ban.guild.members.unban(ban.user.id, "Anti ban Nox Tweaks").catch(() => null);
      await sendLog(ban.guild, "ban", logEmbed("Anti ban", `${ban.user.tag} foi desbanido automaticamente. Verifique auditoria do servidor.`, config.menuColor));
    } else {
      await sendLog(ban.guild, "ban", logEmbed("Usuario banido", `${ban.user.tag} foi banido do servidor.`, config.menuColor));
    }
  });

  client.on("guildBanRemove", async (ban) => {
    const config = getGuildConfig(ban.guild.id);
    await sendLog(ban.guild, "unban", logEmbed("Usuario desbanido", `${ban.user.tag} foi desbanido do servidor.`, config.menuColor));
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

module.exports = {
  registerEvents
};

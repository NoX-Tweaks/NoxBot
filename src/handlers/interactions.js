const {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  RoleSelectMenuBuilder,
  TextInputStyle
} = require("discord.js");
const {
  buildDevDiagnostic,
  buildDevErrors,
  buildDevPermissions,
  buildDevTickets,
  callPanel,
  sanitizedConfigAttachment
} = require("./commands");
const { getGuildConfig, saveGuildConfig } = require("../database/guildStore");
const {
  buildCustomEmbed,
  customizeMenu,
  embedMenu,
  logMenu,
  mainMenu,
  securityMenu,
  securityOptionMenu,
  serverSectionMenu,
  serverMenu,
  ticketButtonMenu,
  ticketEmbedConfigMenu,
  ticketEmbedOverviewMenu,
  ticketImageMenu,
  ticketManageListMenu,
  ticketManageMenu,
  ticketOpenListMenu,
  ticketSelectMenuPanel,
  ticketSelectOptionMenu,
  ticketMenu
} = require("../ui/menus");
const { modal } = require("../ui/modals");
const { hasMenuAccess } = require("../utils/permissions");
const { normalizeColor, resolveGuildEmojiText, yesNo } = require("../utils/discord");
const { logEmbed, sendLog, userLogEmbed } = require("../utils/logs");
const { updateBotPresence } = require("../utils/presence");
const { recordError } = require("../systems/errorStore");
const {
  connectCall24h,
  disconnectCall24h,
  markCall24hConnected,
  markCall24hDisconnected
} = require("../systems/call24h");
const {
  claimTicket,
  closeTicket,
  deleteTicket,
  buildTicketEmbed,
  getTicketPanel,
  openTicket,
  sendTicketPanel
} = require("../systems/tickets");
const {
  buildSessionEmbed,
  buildSessionComponents,
  embedBuilderPanel,
  embedEditorMessage,
  getEmbedSession,
  setUploadSession,
  updateEmbedSession
} = require("../systems/embedEditor");

const DEV_USER_IDS = new Set([
  "846883751866400768",
  "330118907438301185",
  "880169129242407014"
]);

async function handleInteractionCreate(interaction) {
  if (!interaction.guild) {
    if (interaction.isButton?.() && interaction.customId?.startsWith("dev:")) return handleDevButton(interaction);
    return;
  }

  try {
    if (interaction.isButton() || interaction.isAnySelectMenu()) {
      const publicTicketAction = /^ticket:open(?:Button)?:/.test(interaction.customId) || ["ticket:claim", "ticket:close", "ticket:delete"].includes(interaction.customId);
      if (!publicTicketAction && !hasMenuAccess(interaction.member)) {
        return interaction.reply({ content: `${interaction.member}, voce nao tem acesso ao painel. Peca para alguem que tenha permissao liberar voce.`, flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isButton()) return await handleButton(interaction);
    if (interaction.isAnySelectMenu()) return await handleSelect(interaction);
    if (interaction.isModalSubmit()) return await handleModal(interaction);
  } catch (error) {
    if (isIgnorableInteractionError(error)) return null;
    console.error("Erro ao processar interacao:", error);
    recordError("interaction", error, {
      guildId: interaction.guild?.id,
      userId: interaction.user?.id,
      customId: interaction.customId || null
    });
    const detail = error?.message ? `\nDetalhe: \`${String(error.message).slice(0, 180)}\`` : "";
    const payload = { content: `Nao consegui concluir essa acao. Verifique as permissoes e os dados enviados.${detail}`, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
    return interaction.reply(payload).catch(() => null);
  }
}

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}

async function handleButton(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  if (interaction.customId === "menu:back") return interaction.update(mainMenu(config, interaction.user, interaction.client.user));
  if (interaction.customId === "menu:personalizar") return interaction.update(customizeMenu(config, interaction.user, interaction.client.user));
  if (interaction.customId === "menu:servidor") return interaction.update(serverMenu(config, interaction.user, interaction.client.user));
  if (interaction.customId === "menu:seguranca") return interaction.update(securityMenu(config, interaction.user, interaction.client.user));
  if (interaction.customId === "menu:ticket") return interaction.update(ticketMenu(config, interaction.user, interaction.client.user));
  if (interaction.customId === "menu:embed") return interaction.update(embedMenu(config, interaction.user, interaction.client.user));
  if (interaction.customId === "menu:log") return interaction.update(logMenu(config, interaction.user, interaction.client.user));

  if (interaction.customId === "botcall:set") {
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("botcall:setChannel")
        .setPlaceholder("Escolha a call 24/7")
        .setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    );
    return interaction.update({ embeds: callPanel(interaction.guild, config).embeds, components: [row] });
  }

  if (interaction.customId === "botcall:connect") {
    const result = await connectCall24h(interaction.guild);
    if (!result.ok) return interaction.reply({ content: result.reason || "Nao consegui conectar nessa call.", flags: MessageFlags.Ephemeral });
    const updated = markCall24hConnected(interaction.guild.id);
    await sendLog(interaction.guild, "basic", userLogEmbed("Bot conectado em call", interaction.member || interaction.user, [
      `Canal: ${result.channel}`,
      `Horario: <t:${Math.floor(Date.now() / 1000)}:T>`
    ], updated.menuColor));
    return interaction.update(callPanel(interaction.guild, updated));
  }

  if (interaction.customId === "botcall:disconnect") {
    disconnectCall24h(interaction.guild.id);
    const updated = markCall24hDisconnected(interaction.guild.id);
    await sendLog(interaction.guild, "basic", userLogEmbed("Bot desconectado da call", interaction.member || interaction.user, [
      "Acao: **desconectou o bot da call 24/7**",
      `Horario: <t:${Math.floor(Date.now() / 1000)}:T>`
    ], updated.menuColor));
    return interaction.update(callPanel(interaction.guild, updated));
  }

  if (interaction.customId === "botcall:close") {
    return interaction.message.delete().catch(() => interaction.update({ content: "Painel fechado.", embeds: [], components: [] }));
  }

  if (interaction.customId.startsWith("log:set:")) {
    const key = interaction.customId.split(":")[2];
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`log:channel:${key}`)
        .setPlaceholder("Escolha o canal de log")
        .setChannelTypes(ChannelType.GuildText)
    );
    return interaction.update({ content: null, embeds: logMenu(config, interaction.user, interaction.client.user).embeds, components: [row] });
  }

  if (interaction.customId === "log:setAll") {
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("log:channel:all")
        .setPlaceholder("Escolha o canal para todos os logs")
        .setChannelTypes(ChannelType.GuildText)
    );
    return interaction.update({ content: null, embeds: logMenu(config, interaction.user, interaction.client.user).embeds, components: [row] });
  }

  if (interaction.customId === "log:disableAll") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      for (const key of Object.keys(cfg.logs || {})) cfg.logs[key] = null;
    });
    return interaction.update(logMenu(updated, interaction.user, interaction.client.user));
  }

  if (interaction.customId === "server:back") return interaction.update(serverMenu(config, interaction.user, interaction.client.user));
  if (interaction.customId === "server:placeholder") {
    return interaction.reply({ content: "Essa parte visual ja esta criada. A configuracao avancada entra na proxima etapa.", flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === "server:autoroleToggle") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.autoRole.enabled = !cfg.autoRole.enabled;
    });
    await interaction.update(serverSectionMenu(updated, "autorole"));
    return sendLog(interaction.guild, "basic", userLogEmbed("Autocargo atualizado", interaction.member || interaction.user, [
      `Status: **${updated.autoRole.enabled ? "ativado" : "desativado"}**`
    ], updated.menuColor));
  }

  if (interaction.customId === "server:autorole") {
    const row = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("server:autoroleSelect:member")
        .setPlaceholder("Escolha o cargo de membro")
        .setMinValues(1)
        .setMaxValues(1)
    );
    return interaction.update({ content: null, embeds: serverSectionMenu(config, "autorole").embeds, components: [row] });
  }

  if (interaction.customId === "server:autoroleBot" || interaction.customId === "server:autoroleBooster") {
    const type = interaction.customId === "server:autoroleBot" ? "bot" : "booster";
    const row = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`server:autoroleSelect:${type}`)
        .setPlaceholder(type === "bot" ? "Escolha o cargo de bot" : "Escolha o cargo de booster")
        .setMinValues(1)
        .setMaxValues(1)
    );
    return interaction.update({ content: null, embeds: serverSectionMenu(config, "autorole").embeds, components: [row] });
  }

  if (["server:autoreactionsToggle", "server:userreactionsToggle", "server:automessageToggle"].includes(interaction.customId)) {
    const map = {
      "server:autoreactionsToggle": ["autoReactions", "autoreactions"],
      "server:userreactionsToggle": ["userReactions", "userreactions"],
      "server:automessageToggle": ["autoMessages", "automessage"]
    };
    const [configKey, section] = map[interaction.customId];
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg[configKey].enabled = !cfg[configKey].enabled;
    });
    return interaction.update(serverSectionMenu(updated, section));
  }

  if (interaction.customId === "server:welcomeToggle") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.welcome.enabled = !cfg.welcome.enabled;
    });
    return interaction.update(serverSectionMenu(updated, "welcome"));
  }

  if (interaction.customId === "server:welcomeChannel") {
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("server:welcomeChannelSelect")
        .setPlaceholder("Escolha o canal de bem-vindo")
        .setChannelTypes(ChannelType.GuildText)
    );
    return interaction.update({ content: null, embeds: serverSectionMenu(config, "welcome").embeds, components: [row] });
  }

  if (interaction.customId === "server:welcomeMode") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.welcome.mode = cfg.welcome.mode === "Embed" ? "Normal" : "Embed";
    });
    return interaction.update(serverSectionMenu(updated, "welcome"));
  }

  if (interaction.customId === "server:welcomeTime") {
    return interaction.showModal(modal("modal:welcomeTime", "Tempo do bem-vindo", [
      { id: "seconds", label: "Tempo para apagar em segundos", required: true, value: String(config.welcome?.deleteAfter || 30) }
    ]));
  }

  if (interaction.customId === "server:welcomeMessage") {
    return interaction.showModal(modal("modal:welcomeMessage", "Mensagem de bem-vindo", [
      { id: "message", label: "Mensagem", style: TextInputStyle.Paragraph, required: true, value: config.welcome?.message || "" }
    ]));
  }

  if (interaction.customId === "server:welcomeDm") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.welcome.dmEnabled = !cfg.welcome.dmEnabled;
    });
    return interaction.update(serverSectionMenu(updated, "welcome"));
  }

  if (interaction.customId === "server:welcomeResetMessage") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.welcome.message = "Bem-vindo {member} ao {servername}!";
    });
    return interaction.update(serverSectionMenu(updated, "welcome"));
  }

  if (interaction.customId === "server:welcomeResetChannel") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.welcome.channelId = null;
    });
    return interaction.update(serverSectionMenu(updated, "welcome"));
  }

  if (interaction.customId === "server:welcomePreview") {
    const text = formatTemplate(config.welcome?.message, interaction.member);
    const embed = logEmbed("Bem-vindo", text, config.menuColor);
    if (config.welcome?.image) embed.setImage(config.welcome.image);
    const payload = config.welcome?.mode === "Embed"
      ? { embeds: [embed], flags: MessageFlags.Ephemeral }
      : { content: text, flags: MessageFlags.Ephemeral };
    return interaction.reply(payload);
  }

  if (interaction.customId === "server:welcomeImage") {
    setUploadSession(interaction.guild.id, interaction.user.id, "welcomeImage");
    return interaction.reply({ content: "Envie a imagem de boas-vindas como anexo em ate 5 minutos.", flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === "server:welcomeClearImage") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.welcome.image = null;
    });
    return interaction.update(serverSectionMenu(updated, "welcome"));
  }

  if (interaction.customId === "server:autoreactionAdd") {
    return interaction.showModal(modal("modal:autoReactionAdd", "Adicionar auto reacao", [
      { id: "channel", label: "ID do canal ou vazio para todos" },
      { id: "emoji", label: "Emoji(s) separados por espaco", required: true }
    ]));
  }

  if (interaction.customId === "server:autoreactionList") {
    const items = config.autoReactions?.items || [];
    return interaction.reply({ content: items.length ? items.map((item, i) => `${i + 1}. Canal: ${item.channelId ? `<#${item.channelId}>` : "todos"} | Emojis: ${item.emojis.join(" ")}`).join("\n") : "Nenhuma auto reacao configurada.", flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === "server:autoreactionRemove") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.autoReactions.items = [];
    });
    return interaction.update(serverSectionMenu(updated, "autoreactions"));
  }

  if (interaction.customId === "server:userreactionChannels") {
    return interaction.showModal(modal("modal:userReactionChannels", "Canais permitidos", [
      { id: "channels", label: "IDs dos canais separados por virgula", style: TextInputStyle.Paragraph, value: (config.userReactions?.channels || []).join(",") }
    ]));
  }

  if (interaction.customId === "server:userreactionUsers") {
    return interaction.showModal(modal("modal:userReactionUsers", "Reacoes por usuario", [
      { id: "user", label: "ID do usuario", required: true },
      { id: "emojis", label: "Emoji(s) separados por espaco", required: true }
    ]));
  }

  if (interaction.customId === "server:userreactionList") {
    const users = Object.entries(config.userReactions?.users || {});
    return interaction.reply({ content: users.length ? users.map(([id, emojis]) => `<@${id}>: ${emojis.join(" ")}`).join("\n") : "Nenhuma reacao por usuario configurada.", flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === "server:automessageAdd") {
    return interaction.showModal(modal("modal:autoMessageAdd", "Auto mensagem", [
      { id: "channel", label: "ID do canal", required: true },
      { id: "interval", label: "Intervalo em minutos", value: "60", required: true },
      { id: "mode", label: "normal ou embed", value: "normal", required: true },
      { id: "message", label: "Mensagem", style: TextInputStyle.Paragraph, required: true }
    ]));
  }

  if (interaction.customId === "server:automessageList") {
    const items = config.autoMessages?.items || [];
    return interaction.reply({ content: items.length ? items.map((item, i) => `${i + 1}. <#${item.channelId}> | ${item.intervalMinutes}min | ${item.mode} | ${item.enabled ? "on" : "off"}`).join("\n") : "Nenhuma auto mensagem configurada.", flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === "server:automessageReset") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.autoMessages.items = [];
      cfg.autoMessages.selectedItemId = null;
    });
    return interaction.update(serverSectionMenu(updated, "automessage"));
  }

  if (interaction.customId === "custom:prefix") {
    return interaction.showModal(modal("modal:prefix", "Alterar prefixo", [
      { id: "prefix", label: "Novo prefixo", required: true, value: config.prefix }
    ]));
  }

  if (interaction.customId === "custom:language") {
    return interaction.showModal(modal("modal:language", "Alterar idioma", [
      { id: "language", label: "Idioma", required: true, value: config.language || "pt-br" }
    ]));
  }

  if (interaction.customId === "custom:nickname") {
    return interaction.showModal(modal("modal:nickname", "Alterar nickname", [
      { id: "name", label: "Novo nickname/nome", required: true, value: interaction.client.user.username }
    ]));
  }

  if (interaction.customId === "custom:bot") {
    return interaction.showModal(modal("modal:bot", "Personalizar bot", [
      { id: "name", label: "Nome do bot", value: interaction.client.user.username },
      { id: "avatar", label: "URL do icon/avatar" },
      { id: "banner", label: "URL do banner" }
    ]));
  }

  if (interaction.customId === "custom:defaultEmbed") {
    return interaction.showModal(modal("modal:menuColor", "Cor Menu", [
      { id: "color", label: "Cor HEX", required: true, value: config.menuColor || "#2B6CFF" }
    ]));
  }

  if (interaction.customId === "custom:iconFile") {
    setUploadSession(interaction.guild.id, interaction.user.id, "avatar");
    return interaction.reply({ content: "Envie uma imagem anexada neste canal em ate 5 minutos para virar o icon do bot.", flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === "custom:bannerFile") {
    setUploadSession(interaction.guild.id, interaction.user.id, "banner");
    return interaction.reply({ content: "Envie uma imagem anexada neste canal em ate 5 minutos para virar o banner do bot.", flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === "security:back") {
    return interaction.update(securityMenu(config));
  }

  if (interaction.customId.startsWith("security:set:")) {
    const [, , key, state] = interaction.customId.split(":");
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.security[key] = state === "on";
    });
    await sendLog(interaction.guild, "security", userLogEmbed("Seguranca atualizada", interaction.member || interaction.user, [
      `Protecao: \`${key}\``,
      `Status: **${state === "on" ? "on" : "off"}**`
    ], updated.menuColor));
    return interaction.update(securityOptionMenu(updated, key));
  }

  if (interaction.customId === "security:settings") {
    return interaction.showModal(modal("modal:securitySettings", "Punições e limites", [
      { id: "action", label: "Acao: delete, timeout, kick, ban, log", value: config.security.action || "timeout", required: true },
      { id: "spam", label: "Spam: limite,janelaSeg. Ex: 6,6", value: `${config.security.spamLimit || 6},${config.security.spamWindowSeconds || 6}`, required: true },
      { id: "timeout", label: "Timeout em segundos", value: String(config.security.timeoutSeconds || 60), required: true },
      { id: "observe", label: "Modo observar: sim ou nao", value: config.security.observeOnly ? "sim" : "nao", required: true }
    ]));
  }

  if (interaction.customId.startsWith("embededit:")) {
    const [, action, ownerId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId && !hasMenuAccess(interaction.member)) {
      return interaction.reply({ content: "Apenas quem abriu o editor ou alguem com acesso ao menu pode usar isso.", flags: MessageFlags.Ephemeral });
    }
    const session = getEmbedSession(interaction.guild.id, ownerId);
    if (!session) return interaction.reply({ content: "Sessao de embed expirada. Use o comando novamente.", flags: MessageFlags.Ephemeral });

    if (action === "edit") {
      return interaction.showModal(modal(`modal:embedEdit:${ownerId}`, "Editar embed", [
        { id: "title", label: "Titulo", value: session.title || "" },
        { id: "description", label: "Descricao", style: TextInputStyle.Paragraph, value: session.description || "" },
        { id: "color", label: "Cor HEX", value: session.color || "#2B6CFF" },
        { id: "image", label: "URL da imagem ou GIF", value: session.image || "" },
        { id: "footer", label: "Rodape", value: session.footer || "" }
      ]));
    }

    const channel = interaction.guild.channels.cache.get(session.channelId);
    if (!channel?.isTextBased()) return interaction.reply({ content: "Canal da embed nao encontrado.", flags: MessageFlags.Ephemeral });

    if (action === "update") {
      const message = await channel.messages.fetch(session.messageId).catch(() => null);
      if (!message) return interaction.reply({ content: "Mensagem original nao encontrada.", flags: MessageFlags.Ephemeral });
      await message.edit({ embeds: [buildSessionEmbed(session)] }).catch(() => null);
      return interaction.update(embedBuilderPanel(session, ownerId));
    }

    if (action === "send") {
      await channel.send({ embeds: [buildSessionEmbed(session)] });
      return interaction.update(embedBuilderPanel(session, ownerId));
    }
  }

  if (interaction.customId.startsWith("embedbuilder:")) {
    const [, action, ownerId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId && !hasMenuAccess(interaction.member)) {
      return interaction.reply({ content: "Apenas quem abriu o editor ou alguem com acesso ao menu pode usar isso.", flags: MessageFlags.Ephemeral });
    }

    const session = getEmbedSession(interaction.guild.id, ownerId);
    if (!session) return interaction.reply({ content: "Sessao de embed expirada. Use o comando novamente.", flags: MessageFlags.Ephemeral });

    if (action === "preview") {
      const panel = embedBuilderPanel(session, ownerId);
      return interaction.update({ embeds: [buildSessionEmbed(session), ...panel.embeds], components: panel.components });
    }

    if (action === "cancel") {
      return interaction.message.delete().catch(() => interaction.update({ content: "Editor cancelado.", embeds: [], components: [] }));
    }

    const channel = interaction.guild.channels.cache.get(session.channelId);
    if (!channel?.isTextBased()) return interaction.reply({ content: "Canal da embed nao encontrado.", flags: MessageFlags.Ephemeral });

    if (action === "send") {
      if (session.messageId) {
        const targetMessage = await channel.messages.fetch(session.messageId).catch(() => null);
        if (!targetMessage) return interaction.reply({ content: "Mensagem original nao encontrada.", flags: MessageFlags.Ephemeral });
        await targetMessage.edit({ embeds: [buildSessionEmbed(session)], components: buildSessionComponents(session) });
        return interaction.update(embedBuilderPanel(session, ownerId));
      }
      await channel.send({ embeds: [buildSessionEmbed(session)], components: buildSessionComponents(session) });
      return interaction.update(embedBuilderPanel(session, ownerId));
    }
  }

  if (interaction.customId === "ticket:createPanel") {
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("ticket:createChannel")
        .setPlaceholder("Escolha o canal do painel")
        .setChannelTypes(ChannelType.GuildText)
    );
    return interaction.update({ content: null, embeds: ticketMenu(config, interaction.user, interaction.client.user).embeds, components: [row] });
  }

  if (interaction.customId === "ticket:closeEditor") {
    return interaction.message.delete().catch(() => interaction.update({ content: "Painel apagado.", embeds: [], components: [] }));
  }

  if (interaction.customId === "ticket:backHome") return interaction.update(ticketMenu(config));
  if (interaction.customId === "ticket:manageList") return interaction.update(ticketManageListMenu(config));
  if (interaction.customId === "ticket:openManage") {
    const panelId = config.ticket.selectedPanelId || Object.keys(config.ticketPanels || {})[0];
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      if (!panelId || !cfg.ticketPanels?.[panelId]) return;
      cfg.ticket.selectedPanelId = panelId;
      cfg.ticketPanels[panelId].color = normalizeColor(cfg.ticketPanels[panelId].color, cfg.menuColor);
      if (cfg.ticketPanels[panelId].panelEmbed?.color) {
        cfg.ticketPanels[panelId].panelEmbed.color = normalizeColor(cfg.ticketPanels[panelId].panelEmbed.color, cfg.ticketPanels[panelId].color);
      }
      if (cfg.ticketPanels[panelId].internalEmbed?.color) {
        cfg.ticketPanels[panelId].internalEmbed.color = normalizeColor(cfg.ticketPanels[panelId].internalEmbed.color, cfg.ticketPanels[panelId].color);
      }
    });
    return interaction.update(ticketManageMenu(updated, panelId));
  }

  if (interaction.customId === "ticket:setCategory") {
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("ticket:setCategorySelect")
        .setPlaceholder("Escolha a categoria")
        .setChannelTypes(ChannelType.GuildCategory)
    );
    return interaction.update({ content: null, embeds: ticketManageMenu(config, config.ticket.selectedPanelId).embeds, components: [row] });
  }

  if (interaction.customId === "ticket:setRoles") {
    const row = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("ticket:setRolesSelect")
        .setPlaceholder("Escolha os cargos responsaveis")
        .setMinValues(1)
        .setMaxValues(5)
    );
    return interaction.update({ content: null, embeds: ticketManageMenu(config, config.ticket.selectedPanelId).embeds, components: [row] });
  }

  if (interaction.customId === "ticket:setLogs") {
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("ticket:setLogsSelect")
        .setPlaceholder("Escolha o canal de logs")
        .setChannelTypes(ChannelType.GuildText)
    );
    return interaction.update({ content: null, embeds: ticketManageMenu(config, config.ticket.selectedPanelId).embeds, components: [row] });
  }

  if (interaction.customId === "ticket:images") {
    return interaction.update(ticketImageMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:openTickets") {
    return interaction.update(ticketOpenListMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:renamePanel") {
    const panel = getTicketPanel(config, config.ticket.selectedPanelId);
    return interaction.showModal(modal("modal:ticketRename", "Renomear Ticket", [
      { id: "name", label: "Nome do ticket no menu", required: true, value: panel.name || "Ticket" }
    ]));
  }

  if (interaction.customId === "ticket:toggleLimit") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) panel.ticketLimit = panel.ticketLimit === "panel" ? "global" : "panel";
    });
    return interaction.update(ticketManageMenu(updated, updated.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:imageBanner" || interaction.customId === "ticket:imageThumbnail") {
    const field = interaction.customId === "ticket:imageBanner" ? "bannerImage" : "thumbnailImage";
    return promptTicketInput(interaction, "ticket:panelImage", `Envie a imagem para ${field === "bannerImage" ? "banner" : "thumbnail"} como anexo ou link.`, {
      field,
      returnTo: "images"
    });
  }

  if (interaction.customId === "ticket:imageRemove") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (!panel) return;
      panel.bannerImage = null;
      panel.thumbnailImage = null;
      panel.image = null;
    });
    return interaction.update(ticketImageMenu(updated, updated.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:previewPanel") {
    const panel = getTicketPanel(config, config.ticket.selectedPanelId);
    return interaction.reply({ embeds: [buildTicketEmbed(panel, "panel", config)], flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === "ticket:toggleSelect") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) panel.useSelectMenu = true;
    });
    return interaction.update(ticketSelectMenuPanel(updated, updated.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:toggleButton") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) {
        panel.useButton = true;
        panel.button = panel.button || { label: "Abrir Ticket", description: panel.description, emoji: null, color: "Success" };
      }
    });
    return interaction.update(ticketButtonMenu(updated, updated.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:selectAdd") {
    return promptTicketInput(interaction, "ticket:selectOption", [
      "Envie os dados da opcao no chat para salvar.",
      "Linha 1: titulo",
      "Linha 2: descricao",
      "Linha 3: emoji ou ID"
    ].join("\n"), { mode: "add", returnTo: "selectOption" });
  }

  if (interaction.customId === "ticket:selectRemove") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel?.selectOptions?.length) {
        const removeId = panel.selectedSelectOptionId || panel.selectOptions[panel.selectOptions.length - 1].id;
        panel.selectOptions = panel.selectOptions.filter(option => option.id !== removeId);
        panel.selectedSelectOptionId = panel.selectOptions[0]?.id || null;
      }
    });
    return interaction.update(ticketSelectMenuPanel(updated, updated.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:selectEdit") {
    const panel = config.ticketPanels?.[config.ticket.selectedPanelId];
    const option = panel?.selectOptions?.find(item => item.id === panel.selectedSelectOptionId);
    if (!option) return interaction.reply({ content: "Selecione uma opcao primeiro.", flags: MessageFlags.Ephemeral });
    return promptTicketInput(interaction, "ticket:selectOption", [
      "Envie os dados da opcao no chat para salvar.",
      "Linha 1: titulo",
      "Linha 2: descricao",
      "Linha 3: emoji ou ID"
    ].join("\n"), { mode: "edit", returnTo: "selectOption" });
  }

  if (interaction.customId === "ticket:selectRoles") {
    const row = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("ticket:selectRolesSelect")
        .setPlaceholder("Escolha cargos responsaveis desta opcao")
        .setMinValues(0)
        .setMaxValues(5)
    );
    return interaction.update({ content: null, embeds: ticketSelectOptionMenu(config, config.ticketPanels?.[config.ticket.selectedPanelId]?.selectedSelectOptionId).embeds, components: [row] });
  }

  if (interaction.customId === "ticket:selectEmbed") {
    const panel = config.ticketPanels?.[config.ticket.selectedPanelId];
    const option = panel?.selectOptions?.find(item => item.id === panel.selectedSelectOptionId);
    if (!option) return interaction.reply({ content: "Selecione uma opcao primeiro.", flags: MessageFlags.Ephemeral });
    return promptTicketInput(interaction, "ticket:selectEmbed", [
      "Envie a embed interna desta opcao no chat.",
      "Linha 1: titulo",
      "Linha 2: cor HEX",
      "Linha 3 em diante: descricao"
    ].join("\n"), { returnTo: "selectOption" });
  }

  if (interaction.customId === "ticket:selectAdvanced") {
    const panel = config.ticketPanels?.[config.ticket.selectedPanelId];
    const option = panel?.selectOptions?.find(item => item.id === panel.selectedSelectOptionId);
    if (!option) return interaction.reply({ content: "Selecione uma opcao primeiro.", flags: MessageFlags.Ephemeral });
    return interaction.showModal(modal("modal:ticketSelectAdvanced", "Config avancada da opcao", [
      { id: "category", label: "ID categoria opcional", value: option.categoryId || "" },
      { id: "prefix", label: "Prefixo do canal", value: option.channelPrefix || "ticket" },
      { id: "staff", label: "IDs cargos staff separados por virgula", style: TextInputStyle.Paragraph, value: (option.roleIds || []).join(",") }
    ]));
  }

  if (interaction.customId === "ticket:selectRemoveCurrent") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (!panel?.selectedSelectOptionId) return;
      panel.selectOptions = (panel.selectOptions || []).filter(option => option.id !== panel.selectedSelectOptionId);
      panel.selectedSelectOptionId = panel.selectOptions[0]?.id || null;
    });
    return interaction.update(ticketSelectMenuPanel(updated, updated.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:buttonDescription") {
    return promptTicketInput(interaction, "ticket:buttonField", "Envie a descricao do botao no chat para salvar.", { field: "description", returnTo: "button" });
  }

  if (interaction.customId === "ticket:buttonEmoji") {
    return promptTicketInput(interaction, "ticket:buttonField", "Envie o emoji ou ID no chat para salvar no botao.", { field: "emoji", returnTo: "button" });
  }

  if (interaction.customId === "ticket:buttonColor") {
    return promptTicketInput(interaction, "ticket:buttonField", "Envie a cor do botao no chat: Primary, Secondary, Success ou Danger.", { field: "color", returnTo: "button" });
  }

  if (interaction.customId === "ticket:buttonSave") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) panel.useButton = true;
    });
    return interaction.update(ticketManageMenu(updated, updated.ticket.selectedPanelId));
  }

  if (["ticket:toggleTopic"].includes(interaction.customId)) {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) {
        panel.useTopic = !panel.useTopic;
        if (panel.useTopic) panel.categoryId = null;
      }
    });
    return interaction.update(ticketManageMenu(updated, updated.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:schedule") {
    const panel = getTicketPanel(config, config.ticket.selectedPanelId);
    return interaction.showModal(modal("modal:ticketSchedule", "Horarios do ticket", [
      { id: "schedule", label: "Horario ou N/A", value: panel.schedule || "N/A" }
    ]));
  }

  if (interaction.customId === "ticket:config" || interaction.customId === "ticket:configPanel") {
    const panel = getTicketPanel(config, config.ticket.selectedPanelId);
    return interaction.showModal(modal("modal:ticketConfig", "Configurar ticket", [
      { id: "panel", label: "ID do canal do painel", value: panel.panelChannelId || "" },
      { id: "category", label: "ID da categoria dos tickets", value: panel.categoryId || "" },
      { id: "staff", label: "ID do cargo staff", value: panel.staffRoleId || "" },
      { id: "log", label: "ID do canal de logs de ticket", value: panel.logChannelId || "" },
      { id: "openMessage", label: "Mensagem ao abrir ticket", value: panel.openMessage || "" }
    ]));
  }

  if (interaction.customId === "ticket:appearance") {
    return interaction.update(ticketEmbedOverviewMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:embedPanel") {
    return interaction.update(ticketEmbedConfigMenu(config, "panel"));
  }

  if (interaction.customId === "ticket:embedInternal") {
    return interaction.update(ticketEmbedConfigMenu(config, "internal"));
  }

  if (interaction.customId.startsWith("ticket:embedColor:")) {
    const kind = interaction.customId.split(":")[2];
    return promptTicketInput(interaction, "ticket:embedColor", "Envie a cor HEX no chat para salvar na embed.", { kind });
  }

  if (interaction.customId.startsWith("ticket:embedSave:")) {
    return interaction.update(ticketEmbedOverviewMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId === "ticket:deletePanel") {
    const selectedPanelId = config.ticket.selectedPanelId;
    if (!selectedPanelId || !config.ticketPanels?.[selectedPanelId]) {
      return interaction.reply({ content: "Selecione um ticket criado antes de apagar.", flags: MessageFlags.Ephemeral });
    }

    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      delete cfg.ticketPanels[selectedPanelId];
      cfg.ticket.selectedPanelId = Object.keys(cfg.ticketPanels)[0] || null;
    });

    return interaction.update(ticketManageListMenu(updated));
  }

  if (interaction.customId === "ticket:sendPanel") return sendTicketPanel(interaction, config);
  if (interaction.customId.startsWith("ticket:open")) return openTicket(interaction);
  if (interaction.customId === "ticket:claim") return claimTicket(interaction);
  if (interaction.customId === "ticket:close") {
    return interaction.showModal(modal("modal:ticketClose", "Fechar ticket", [
      { id: "reason", label: "Motivo do fechamento", style: TextInputStyle.Paragraph, required: true, value: "Resolvido" }
    ]));
  }
  if (interaction.customId === "ticket:delete") return deleteTicket(interaction);

  if (interaction.customId === "embed:config") {
    return interaction.showModal(modal("modal:embedConfig", "Editar embed", [
      { id: "title", label: "Titulo", value: config.embed.title },
      { id: "description", label: "Descricao", style: TextInputStyle.Paragraph, value: config.embed.description },
      { id: "color", label: "Cor HEX", value: config.embed.color },
      { id: "image", label: "URL da imagem", value: config.embed.image || "" },
      { id: "footer", label: "Rodape", value: config.embed.footer || "" }
    ]));
  }

  if (interaction.customId === "embed:send") {
    await interaction.channel.send({ embeds: [buildCustomEmbed(config)] });
    return interaction.update(embedMenu(config, interaction.user, interaction.client.user));
  }
}

async function handleDevButton(interaction) {
  const [, action, guildId] = interaction.customId.split(":");
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: "Servidor nao encontrado no cache do bot." });
  if (!isDevUserId(interaction.user.id, guild)) return interaction.reply({ content: "Apenas dev autorizado pode usar este painel." });
  const config = getGuildConfig(guild.id);
  if (action === "close") return interaction.message.delete().catch(() => interaction.reply({ content: "Painel fechado." }));
  if (action === "diagnostic") return interaction.reply({ embeds: [buildDevDiagnostic(guild, config)] });
  if (action === "tickets") return interaction.reply({ embeds: [buildDevTickets(guild, config)] });
  if (action === "permissions") return interaction.reply({ embeds: [buildDevPermissions(guild, config)] });
  if (action === "errors") return interaction.reply({ embeds: [buildDevErrors(config)] });
  if (action === "export") return interaction.reply({ content: "Config sanitizada do servidor.", files: [sanitizedConfigAttachment(config)] });
}

function isDevUserId(userId, guild) {
  return DEV_USER_IDS.has(userId);
}

async function handleSelect(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  if (interaction.customId === "menu:navigate") {
    const area = interaction.values[0];
    if (area === "inicio") return interaction.update(mainMenu(config, interaction.user, interaction.client.user));
    if (area === "personalizar") return interaction.update(customizeMenu(config, interaction.user, interaction.client.user));
    if (area === "servidor") return interaction.update(serverMenu(config, interaction.user, interaction.client.user));
    if (area === "seguranca") return interaction.update(securityMenu(config, interaction.user, interaction.client.user));
    if (area === "ticket") return interaction.update(ticketMenu(config, interaction.user, interaction.client.user));
    if (area === "embed") return interaction.update(embedMenu(config, interaction.user, interaction.client.user));
    if (area === "log") return interaction.update(logMenu(config, interaction.user, interaction.client.user));
  }

  if (interaction.customId === "botcall:setChannel") {
    const channelId = interaction.values[0];
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.call24h.channelId = channelId;
      cfg.call24h.connected = false;
      cfg.call24h.connectedAt = null;
    });
    return interaction.update(callPanel(interaction.guild, updated));
  }

  if (interaction.customId.startsWith("ticket:open")) {
    return openTicket(interaction);
  }

  if (interaction.customId === "custom:select" || interaction.customId === "custom:open") {
    const config = getGuildConfig(interaction.guild.id);
    const option = interaction.values[0];
    if (option === "inicio") return interaction.update(mainMenu(config, interaction.user, interaction.client.user));
    if (option === "bot") {
      return interaction.showModal(modal("modal:bot", "Personalizar bot", [
        { id: "name", label: "Nome do bot", value: interaction.client.user.username },
        { id: "avatar", label: "URL do icon/avatar" },
        { id: "banner", label: "URL do banner" }
      ]));
    }
    if (option === "prefix") {
      return interaction.showModal(modal("modal:prefix", "Alterar prefixo", [
        { id: "prefix", label: "Novo prefixo", required: true, value: config.prefix }
      ]));
    }
    if (option === "menuColor" || option === "defaultEmbed") {
      return interaction.showModal(modal("modal:menuColor", "Cor Menu", [
        { id: "color", label: "Cor HEX", required: true, value: config.menuColor || "#2B6CFF" }
      ]));
    }
    if (option === "language") {
      return interaction.showModal(modal("modal:language", "Alterar idioma", [
        { id: "language", label: "Idioma", required: true, value: config.language || "pt-br" }
      ]));
    }
    if (option === "nickname") {
      return interaction.showModal(modal("modal:nickname", "Alterar nickname", [
        { id: "name", label: "Novo nickname/nome", required: true, value: interaction.client.user.username }
      ]));
    }
    if (option === "iconFile") {
      setUploadSession(interaction.guild.id, interaction.user.id, "avatar");
      return interaction.reply({ content: "Envie uma imagem anexada neste canal em ate 5 minutos para virar o icon do bot.", flags: MessageFlags.Ephemeral });
    }
    if (option === "bannerFile") {
      setUploadSession(interaction.guild.id, interaction.user.id, "banner");
      return interaction.reply({ content: "Envie uma imagem anexada neste canal em ate 5 minutos para virar o banner do bot.", flags: MessageFlags.Ephemeral });
    }
  }

  if (interaction.customId === "server:open") {
    const section = interaction.values[0];
    if (section === "inicio") return interaction.update(mainMenu(getGuildConfig(interaction.guild.id), interaction.user, interaction.client.user));
    if (section === "home") return interaction.update(serverMenu(getGuildConfig(interaction.guild.id), interaction.user, interaction.client.user));
    return interaction.update(serverSectionMenu(getGuildConfig(interaction.guild.id), section));
  }

  if (interaction.customId === "security:open") {
    const value = interaction.values[0];
    if (value === "inicio") return interaction.update(mainMenu(getGuildConfig(interaction.guild.id), interaction.user, interaction.client.user));
    return interaction.update(securityOptionMenu(getGuildConfig(interaction.guild.id), value));
  }

  if (interaction.customId === "ticket:open") {
    const value = interaction.values[0];
    const config = getGuildConfig(interaction.guild.id);
    if (value === "inicio") return interaction.update(mainMenu(config, interaction.user, interaction.client.user));
    if (value === "create") {
      const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("ticket:createChannel")
          .setPlaceholder("Escolha o canal do painel")
          .setChannelTypes(ChannelType.GuildText)
      );
      return interaction.update({ content: null, embeds: ticketMenu(config, interaction.user, interaction.client.user).embeds, components: [row] });
    }
    if (value === "manage") {
      if (!Object.keys(config.ticketPanels || {}).length) return interaction.reply({ content: "Nenhum ticket criado ainda.", flags: MessageFlags.Ephemeral });
      return interaction.update(ticketManageListMenu(config));
    }
  }

  if (interaction.customId === "embed:open") {
    const config = getGuildConfig(interaction.guild.id);
    const value = interaction.values[0];
    if (value === "inicio") return interaction.update(mainMenu(config, interaction.user, interaction.client.user));
    if (value === "config") {
      return interaction.showModal(modal("modal:embedConfig", "Editar embed", [
        { id: "title", label: "Titulo", value: config.embed.title },
        { id: "description", label: "Descricao", style: TextInputStyle.Paragraph, value: config.embed.description },
        { id: "color", label: "Cor HEX", value: config.embed.color },
        { id: "image", label: "URL da imagem", value: config.embed.image || "" },
        { id: "footer", label: "Rodape", value: config.embed.footer || "" }
      ]));
    }
    if (value === "send") {
      await interaction.channel.send({ embeds: [buildCustomEmbed(config)] });
      return interaction.update(embedMenu(config, interaction.user, interaction.client.user));
    }
    if (value === "builder") {
      const session = createNewEmbedSession(interaction.guild.id, interaction.user.id, interaction.channelId);
      Object.assign(session, {
        title: config.embed.title,
        description: config.embed.description,
        color: config.embed.color,
        image: config.embed.image,
        thumbnail: config.embed.thumbnail,
        footer: config.embed.footer,
        author: config.embed.author,
        fields: config.embed.fields || []
      });
      return interaction.update(embedBuilderPanel(session, interaction.user.id));
    }
    if (value === "saveTemplate") {
      return interaction.showModal(modal("modal:embedTemplateSave", "Salvar template", [
        { id: "name", label: "Nome do template", required: true }
      ]));
    }
    if (value === "loadTemplate") {
      return interaction.showModal(modal("modal:embedTemplateLoad", "Carregar template", [
        { id: "name", label: "Nome do template", required: true }
      ]));
    }
    if (value === "clear") {
      const updated = saveGuildConfig(interaction.guild.id, cfg => {
        cfg.embed = {
          ...cfg.embed,
          title: "Nox Tweaks",
          description: "Configure esta embed pelo menu.",
          color: cfg.menuColor || "#2B6CFF",
          image: null,
          thumbnail: null,
          footer: "Nox Tweaks",
          author: null,
          fields: []
        };
      });
      return interaction.update(embedMenu(updated, interaction.user, interaction.client.user));
    }
  }

  if (interaction.customId.startsWith("embedbuilder:select:")) {
    const ownerId = interaction.customId.split(":")[2];
    if (interaction.user.id !== ownerId && !hasMenuAccess(interaction.member)) {
      return interaction.reply({ content: "Apenas quem abriu o editor ou alguem com acesso ao menu pode usar isso.", flags: MessageFlags.Ephemeral });
    }

    const session = getEmbedSession(interaction.guild.id, ownerId);
    if (!session) return interaction.reply({ content: "Sessao de embed expirada. Use o comando novamente.", flags: MessageFlags.Ephemeral });

    const value = interaction.values[0];
    if (["content", "images", "extras", "buttons", "fields", "back"].includes(value)) {
      return interaction.update(embedBuilderPanel(session, ownerId, value === "back" ? "main" : value));
    }

    if (value === "clear") {
      const updated = updateEmbedSession(interaction.guild.id, ownerId, current => {
        current.image = null;
        current.thumbnail = null;
        current.footer = null;
        current.author = null;
        current.fields = [];
        current.buttons = [];
      });
      return interaction.update(embedBuilderPanel(updated, ownerId));
    }

    if (value === "clearExtras") {
      const updated = updateEmbedSession(interaction.guild.id, ownerId, current => {
        current.footer = null;
        current.author = null;
      });
      return interaction.update(embedBuilderPanel(updated, ownerId, "extras"));
    }

    if (value === "send") {
      const channel = interaction.guild.channels.cache.get(session.channelId);
      if (!channel?.isTextBased()) return interaction.reply({ content: "Canal da embed nao encontrado.", flags: MessageFlags.Ephemeral });
      await channel.send({ embeds: [buildSessionEmbed(session)], components: buildSessionComponents(session) });
      return interaction.update(embedBuilderPanel(session, ownerId));
    }

    if (value === "title") {
      return interaction.showModal(modal(`modal:embedBuilder:title:${ownerId}`, "Definir Titulo", [
        { id: "value", label: "Titulo", required: true, value: session.title || "" }
      ]));
    }
    if (value === "description") {
      return interaction.showModal(modal(`modal:embedBuilder:description:${ownerId}`, "Definir Descricao", [
        { id: "value", label: "Descricao", style: TextInputStyle.Paragraph, required: true, value: session.description || "" }
      ]));
    }
    if (value === "color") {
      return interaction.showModal(modal(`modal:embedBuilder:color:${ownerId}`, "Definir Cor", [
        { id: "value", label: "Cor HEX", required: true, value: session.color || "#2B6CFF" }
      ]));
    }
    if (value === "footer") {
      return interaction.showModal(modal(`modal:embedBuilder:footer:${ownerId}`, "Definir Footer", [
        { id: "value", label: "Footer", value: session.footer || "" }
      ]));
    }
    if (value === "author") {
      return interaction.showModal(modal(`modal:embedBuilder:author:${ownerId}`, "Definir Author", [
        { id: "value", label: "Author", value: session.author || "" }
      ]));
    }
    if (value === "thumbnail" || value === "image") {
      setUploadSession(interaction.guild.id, interaction.user.id, value === "image" ? "embedImage" : "embedThumbnail", { page: "images" });
      return interaction.reply({ content: `Envie ${value === "image" ? "a imagem principal" : "a thumbnail"} como anexo.`, flags: MessageFlags.Ephemeral });
    }
    if (value === "buttonAdd") {
      return interaction.showModal(modal(`modal:embedBuilder:button:${ownerId}`, "Adicionar Botao", [
        { id: "label", label: "Texto do botao", required: true },
        { id: "url", label: "URL do botao", required: true }
      ]));
    }
    if (value === "buttonClear") {
      const updated = updateEmbedSession(interaction.guild.id, ownerId, current => { current.buttons = []; });
      return interaction.update(embedBuilderPanel(updated, ownerId, "buttons"));
    }
    if (value === "fieldAdd") {
      return interaction.showModal(modal(`modal:embedBuilder:field:${ownerId}`, "Adicionar Field", [
        { id: "name", label: "Nome", required: true },
        { id: "value", label: "Valor", style: TextInputStyle.Paragraph, required: true },
        { id: "inline", label: "Inline? sim ou nao", value: "nao" }
      ]));
    }
    if (value === "fieldClear") {
      const updated = updateEmbedSession(interaction.guild.id, ownerId, current => { current.fields = []; });
      return interaction.update(embedBuilderPanel(updated, ownerId, "fields"));
    }
  }

  if (interaction.customId === "log:open") {
    const value = interaction.values[0];
    if (value === "inicio") return interaction.update(mainMenu(getGuildConfig(interaction.guild.id), interaction.user, interaction.client.user));
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`log:channel:${value}`)
        .setPlaceholder("Escolha o canal de log")
        .setChannelTypes(ChannelType.GuildText)
    );
    return interaction.update({ content: null, embeds: logMenu(getGuildConfig(interaction.guild.id), interaction.user, interaction.client.user).embeds, components: [row] });
  }

  if (interaction.customId === "server:welcomeChannelSelect") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.welcome.channelId = interaction.values[0];
    });
    return interaction.update({ content: null, ...serverSectionMenu(updated, "welcome") });
  }

  if (interaction.customId.startsWith("server:autoroleSelect:")) {
    const type = interaction.customId.split(":")[2];
    const key = type === "bot" ? "botRoleId" : type === "booster" ? "boosterRoleId" : "roleId";
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.autoRole[key] = interaction.values[0];
      if (type === "bot") cfg.autoRole.includeBots = true;
    });
    return interaction.update({ content: null, ...serverSectionMenu(updated, "autorole") });
  }

  if (interaction.customId === "ticket:selectPanel") {
    const selectedPanelId = interaction.values[0];
    if (selectedPanelId === "none") {
      return interaction.reply({ content: "Nenhum ticket criado ainda.", flags: MessageFlags.Ephemeral });
    }

    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.ticket.selectedPanelId = selectedPanelId;
    });

    return interaction.update(ticketManageMenu(updated, selectedPanelId));
  }

  if (interaction.customId === "ticket:selectOptionOpen") {
    const optionId = interaction.values[0];
    if (optionId === "none") return interaction.reply({ content: "Nenhuma opcao criada ainda.", flags: MessageFlags.Ephemeral });
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) panel.selectedSelectOptionId = optionId;
    });
    return interaction.update(ticketSelectOptionMenu(updated, optionId));
  }

  if (interaction.customId.startsWith("ticket:embedAdd:")) {
    const kind = interaction.customId.split(":")[2];
    const value = interaction.values[0];
    if (value === "remove") {
      const updated = saveGuildConfig(interaction.guild.id, cfg => {
        const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
        if (!panel) return;
        const key = kind === "internal" ? "internalEmbed" : "panelEmbed";
        const itemId = panel.selectedEmbedItems?.[kind];
        if (!itemId || !panel[key]?.items?.length) return;
        panel[key].items = panel[key].items.filter(item => item.id !== itemId);
        panel.selectedEmbedItems = panel.selectedEmbedItems || {};
        panel.selectedEmbedItems[kind] = null;
      });
      return interaction.update(ticketEmbedConfigMenu(updated, kind));
    }
    if (value === "reset") {
      const updated = saveGuildConfig(interaction.guild.id, cfg => {
        const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
        if (!panel) return;
        const key = kind === "internal" ? "internalEmbed" : "panelEmbed";
        panel[key] = { color: panel.color || "#2B6CFF", items: [] };
      });
      return interaction.update(ticketEmbedConfigMenu(updated, kind));
    }
    if (value === "separator") {
      return interaction.showModal(modal(`modal:ticketEmbedSeparator:${kind}:new`, "Adicionar Separador", [
        { id: "type", label: "Tipo: linha ou espaco", required: true, value: "linha" },
        { id: "spacing", label: "Espacamento: pequeno ou grande", required: true, value: "pequeno" }
      ]));
    }
    if (value === "text") {
      return interaction.showModal(modal(`modal:ticketEmbedText:${kind}:new`, "Adicionar Texto / Secao", [
        { id: "title", label: "Titulo", required: true },
        { id: "description", label: "Descricao", style: TextInputStyle.Paragraph, required: true },
        { id: "thumbnail", label: "Thumbnail URL opcional" }
      ]));
    }
    if (value === "gallery") {
      return interaction.showModal(modal(`modal:ticketEmbedGallery:${kind}:new`, "Adicionar Galeria", [
        { id: "images", label: "Links das imagens (um por linha)", style: TextInputStyle.Paragraph, required: false, placeholder: "https://exemplo.com/imagem1.png\nhttps://exemplo.com/imagem2.png" }
      ]));
    }
  }

  if (interaction.customId.startsWith("ticket:embedEdit:")) {
    const kind = interaction.customId.split(":")[2];
    const itemId = interaction.values[0];
    if (itemId === "none") return interaction.reply({ content: "Nenhum item criado ainda.", flags: MessageFlags.Ephemeral });
    saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (!panel) return;
      panel.selectedEmbedItems = panel.selectedEmbedItems || {};
      panel.selectedEmbedItems[kind] = itemId;
    });
    const panel = config.ticketPanels?.[config.ticket.selectedPanelId];
    const key = kind === "internal" ? "internalEmbed" : "panelEmbed";
    const data = panel?.[key];
    const items = normalizeTicketEmbedItems(data?.items || []);
    const item = items.find(entry => entry.id === itemId);
    if (!item) return interaction.reply({ content: "Item nao encontrado.", flags: MessageFlags.Ephemeral });
    if (item.type === "gallery") {
      return interaction.showModal(modal(`modal:ticketEmbedGallery:${kind}:${itemId}`, "Editar Galeria", [
        { id: "images", label: "Links das imagens (um por linha)", style: TextInputStyle.Paragraph, required: false, value: (item.images || []).join("\n") }
      ]));
    }
    if (item.type === "separator") {
      return interaction.showModal(modal(`modal:ticketEmbedSeparator:${kind}:${itemId}`, "Editar Separador", [
        { id: "type", label: "Tipo: linha, espaco ou remover", required: true, value: item.line ? "linha" : "espaco" },
        { id: "spacing", label: "Espacamento: pequeno ou grande", required: true, value: item.size || "pequeno" }
      ]));
    }
    return interaction.showModal(modal(`modal:ticketEmbedText:${kind}:${itemId}`, "Editar Texto / Secao", [
      { id: "title", label: "Titulo", required: true, value: item.title || "" },
      { id: "description", label: "Descricao", style: TextInputStyle.Paragraph, required: true, value: item.description || "" },
      { id: "thumbnail", label: "Thumbnail URL opcional", value: item.thumbnail || "" }
    ]));
  }

  if (interaction.customId === "ticket:createChannel") {
    const panelChannelId = interaction.values[0];
    const panelId = `panel_${Date.now()}`;
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.ticketPanels[panelId] = {
        name: `Ticket ${Object.keys(cfg.ticketPanels).length + 1}`,
        categoryId: null,
        panelChannelId,
        staffRoleId: null,
        staffRoleIds: [],
        logChannelId: null,
        title: "Suporte Nox Tweaks",
        description: "Clique no botao abaixo para abrir um ticket.",
        color: "#2B6CFF",
        image: null,
        bannerImage: null,
        thumbnailImage: null,
        openMessage: "Descreva seu problema e aguarde a equipe.",
        useTopic: false,
        useButton: true,
        useSelectMenu: false,
        ticketLimit: "global",
        button: {
          label: "Abrir Ticket",
          description: "Uma descricao boladona sobre o ticket.",
          emoji: null,
          color: "Success"
        },
        selectOptions: [],
        selectedSelectOptionId: null,
        schedule: null
      };
      cfg.ticket.selectedPanelId = panelId;
    });
    return interaction.update({ content: null, ...ticketManageMenu(config, panelId) });
  }

  if (interaction.customId.startsWith("log:channel:")) {
    const key = interaction.customId.split(":")[2];
    const channelId = interaction.values[0];
    if (key === "all") {
      const updated = saveGuildConfig(interaction.guild.id, cfg => {
        for (const logKey of Object.keys(cfg.logs || {})) cfg.logs[logKey] = channelId;
      });
      return interaction.update({ content: null, ...logMenu(updated, interaction.user, interaction.client.user) });
    }
    const groupMap = {
      ban: ["ban", "unban", "kick"],
      roleCreate: ["roleCreate", "roleDelete", "roleUpdate", "roleAdd", "roleRemove"],
      channelCreate: ["channelCreate", "channelDelete", "channelUpdate"],
      muteText: ["muteText", "muteVoice"],
      antiBot: ["antiBot"],
      memberJoin: ["memberJoin"],
      memberLeave: ["memberLeave"],
      messageDelete: ["messageDelete", "messageUpdate"],
      voiceTraffic: ["voiceTraffic"]
    };
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      for (const logKey of groupMap[key] || [key]) cfg.logs[logKey] = channelId;
    });
    return interaction.update({ content: null, ...logMenu(updated, interaction.user, interaction.client.user) });
  }

  if (interaction.customId === "ticket:setCategorySelect") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) {
        panel.categoryId = interaction.values[0];
        panel.useTopic = false;
      }
    });
    return interaction.update({ content: null, ...ticketManageMenu(updated, updated.ticket.selectedPanelId) });
  }

  if (interaction.customId === "ticket:setRolesSelect") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) {
        panel.staffRoleIds = interaction.values;
        panel.staffRoleId = interaction.values[0];
      }
    });
    return interaction.update({ content: null, ...ticketManageMenu(updated, updated.ticket.selectedPanelId) });
  }

  if (interaction.customId === "ticket:selectRolesSelect") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      const option = panel?.selectOptions?.find(item => item.id === panel.selectedSelectOptionId);
      if (option) option.roleIds = interaction.values;
    });
    const optionId = updated.ticketPanels?.[updated.ticket.selectedPanelId]?.selectedSelectOptionId;
    return interaction.update({ content: null, ...ticketSelectOptionMenu(updated, optionId) });
  }

  if (interaction.customId === "ticket:setLogsSelect") {
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) panel.logChannelId = interaction.values[0];
    });
    return interaction.update({ content: null, ...ticketManageMenu(updated, updated.ticket.selectedPanelId) });
  }

  if (interaction.customId === "security:toggle") {
    const key = interaction.values[0];
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.security[key] = !cfg.security[key];
    });
    await interaction.update(securityMenu(updated));
    return sendLog(interaction.guild, "security", userLogEmbed("Seguranca atualizada", interaction.member || interaction.user, [
      `Protecao: \`${key}\``,
      `Status: **${updated.security[key] ? "on" : "off"}**`
    ], updated.menuColor));
  }

  if (interaction.customId === "server:logs") {
    return interaction.showModal(modal(`modal:log:${interaction.values[0]}`, "Configurar log", [
      { id: "channel", label: "ID do canal de log", required: true }
    ]));
  }
}

async function handleModal(interaction) {
  if (interaction.customId === "modal:ticketClose") {
    const reason = interaction.fields.getTextInputValue("reason").trim() || "Sem motivo informado.";
    return closeTicket(interaction, reason);
  }

  if (!hasMenuAccess(interaction.member)) {
    return interaction.reply({ content: `${interaction.member}, voce nao tem acesso ao painel. Peca para alguem que tenha permissao liberar voce.`, flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === "modal:prefix") {
    const prefix = interaction.fields.getTextInputValue("prefix").trim();
    if (!prefix || prefix.length > 5) return interaction.reply({ content: "Use um prefixo de 1 a 5 caracteres.", flags: MessageFlags.Ephemeral });
    const config = saveGuildConfig(interaction.guild.id, cfg => { cfg.prefix = prefix; });
    updateBotPresence(interaction.client, config.prefix);
    return interaction.update(customizeMenu(config, interaction.user, interaction.client.user));
  }

  if (interaction.customId === "modal:language") {
    const language = interaction.fields.getTextInputValue("language").trim() || "pt-br";
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.language = language;
    });
    return interaction.update(customizeMenu(config, interaction.user, interaction.client.user));
  }

  if (interaction.customId === "modal:nickname") {
    const name = interaction.fields.getTextInputValue("name").trim();
    if (name) await interaction.client.user.setUsername(name).catch(() => null);
    return interaction.update(customizeMenu(getGuildConfig(interaction.guild.id), interaction.user, interaction.client.user));
  }

  if (interaction.customId === "modal:menuColor") {
    const color = normalizeColor(interaction.fields.getTextInputValue("color").trim());
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.menuColor = color;
    });
    return interaction.update(customizeMenu(config, interaction.user, interaction.client.user));
  }

  if (interaction.customId === "modal:bot") {
    const name = interaction.fields.getTextInputValue("name").trim();
    const avatar = interaction.fields.getTextInputValue("avatar").trim();
    const banner = interaction.fields.getTextInputValue("banner").trim();
    if (name) await interaction.client.user.setUsername(name).catch(() => null);
    if (avatar) await interaction.client.user.setAvatar(avatar).catch(() => null);
    if (banner && typeof interaction.client.user.setBanner === "function") {
      await interaction.client.user.setBanner(banner).catch(() => null);
    }
    return interaction.update(customizeMenu(getGuildConfig(interaction.guild.id), interaction.user, interaction.client.user));
  }

  if (interaction.customId.startsWith("modal:log:")) {
    const type = interaction.customId.split(":")[2];
    const channelId = interaction.fields.getTextInputValue("channel").trim();
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return interaction.reply({ content: "Canal invalido.", flags: MessageFlags.Ephemeral });
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      if (type === "ticket") cfg.ticket.logChannelId = channelId;
      else cfg.logs[type] = channelId;
    });
    return interaction.update(logMenu(config, interaction.user, interaction.client.user));
  }

  if (interaction.customId === "modal:autoRole") {
    const roleId = interaction.fields.getTextInputValue("role").trim();
    const enabledInput = interaction.fields.getTextInputValue("enabled");
    const botsInput = interaction.fields.getTextInputValue("bots");
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return interaction.reply({ content: "Cargo invalido. Use o ID de um cargo do servidor.", flags: MessageFlags.Ephemeral });
    if (role.managed) return interaction.reply({ content: "Esse cargo e gerenciado por integracao e nao pode ser usado como autocargo.", flags: MessageFlags.Ephemeral });

    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.autoRole.roleId = roleId;
      cfg.autoRole.enabled = yesNo(enabledInput);
      cfg.autoRole.includeBots = yesNo(botsInput);
    });

    return interaction.update(serverSectionMenu(config, "autorole"));
  }

  if (interaction.customId === "modal:welcomeTime") {
    const seconds = Math.max(0, Math.min(600, Number(interaction.fields.getTextInputValue("seconds").trim()) || 30));
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.welcome.deleteAfter = seconds;
    });
    return interaction.update(serverSectionMenu(config, "welcome"));
  }

  if (interaction.customId === "modal:welcomeMessage") {
    const message = interaction.fields.getTextInputValue("message").trim();
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.welcome.message = message || "Bem-vindo {member} ao {servername}!";
    });
    return interaction.update(serverSectionMenu(config, "welcome"));
  }

  if (interaction.customId === "modal:autoReactionAdd") {
    const channelId = interaction.fields.getTextInputValue("channel").trim();
    const emojis = interaction.fields.getTextInputValue("emoji").split(/\s+/).map(item => item.trim()).filter(Boolean).slice(0, 5);
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.autoReactions.items = cfg.autoReactions.items || [];
      cfg.autoReactions.items.push({ channelId: /^\d{17,20}$/.test(channelId) ? channelId : null, emojis });
      cfg.autoReactions.items = cfg.autoReactions.items.slice(-20);
      cfg.autoReactions.enabled = true;
    });
    return interaction.update(serverSectionMenu(config, "autoreactions"));
  }

  if (interaction.customId === "modal:userReactionChannels") {
    const channels = interaction.fields.getTextInputValue("channels").split(/[,\s]+/).map(item => item.trim()).filter(id => /^\d{17,20}$/.test(id));
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.userReactions.channels = channels;
    });
    return interaction.update(serverSectionMenu(config, "userreactions"));
  }

  if (interaction.customId === "modal:userReactionUsers") {
    const userId = interaction.fields.getTextInputValue("user").trim();
    const emojis = interaction.fields.getTextInputValue("emojis").split(/\s+/).map(item => item.trim()).filter(Boolean).slice(0, 5);
    if (!/^\d{17,20}$/.test(userId)) return interaction.reply({ content: "ID de usuario invalido.", flags: MessageFlags.Ephemeral });
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.userReactions.users = cfg.userReactions.users || {};
      cfg.userReactions.users[userId] = emojis;
      cfg.userReactions.enabled = true;
    });
    return interaction.update(serverSectionMenu(config, "userreactions"));
  }

  if (interaction.customId === "modal:autoMessageAdd") {
    const channelId = interaction.fields.getTextInputValue("channel").trim();
    const intervalMinutes = Math.max(1, Math.min(1440, Number(interaction.fields.getTextInputValue("interval").trim()) || 60));
    const mode = interaction.fields.getTextInputValue("mode").trim().toLowerCase() === "embed" ? "embed" : "normal";
    const message = interaction.fields.getTextInputValue("message").trim();
    if (!interaction.guild.channels.cache.get(channelId)?.isTextBased?.()) return interaction.reply({ content: "Canal invalido.", flags: MessageFlags.Ephemeral });
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.autoMessages.items = cfg.autoMessages.items || [];
      const item = { id: `auto_${Date.now()}`, channelId, intervalMinutes, mode, message, enabled: true, lastSentAt: null };
      cfg.autoMessages.items.push(item);
      cfg.autoMessages.items = cfg.autoMessages.items.slice(-10);
      cfg.autoMessages.selectedItemId = item.id;
      cfg.autoMessages.enabled = true;
    });
    return interaction.update(serverSectionMenu(config, "automessage"));
  }

  if (interaction.customId === "modal:securitySettings") {
    const allowed = ["delete", "timeout", "kick", "ban", "log"];
    const actionInput = interaction.fields.getTextInputValue("action").trim().toLowerCase();
    const [limitInput, windowInput] = interaction.fields.getTextInputValue("spam").split(",");
    const timeoutSeconds = Math.max(5, Math.min(2419200, Number(interaction.fields.getTextInputValue("timeout").trim()) || 60));
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.security.action = allowed.includes(actionInput) ? actionInput : "timeout";
      cfg.security.spamLimit = Math.max(2, Math.min(20, Number(limitInput) || 6));
      cfg.security.spamWindowSeconds = Math.max(2, Math.min(60, Number(windowInput) || 6));
      cfg.security.timeoutSeconds = timeoutSeconds;
      cfg.security.observeOnly = yesNo(interaction.fields.getTextInputValue("observe"));
    });
    return interaction.update(securityMenu(config));
  }

  if (interaction.customId === "modal:createTicketPanel") {
    const panelId = `panel_${Date.now()}`;
    const name = interaction.fields.getTextInputValue("name").trim();
    const title = embedText(interaction, interaction.fields.getTextInputValue("title"));
    const description = embedText(interaction, interaction.fields.getTextInputValue("description"));
    const color = normalizeColor(interaction.fields.getTextInputValue("color").trim(), "#2B6CFF");
    const panelChannelId = interaction.fields.getTextInputValue("panel").trim() || null;

    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.ticketPanels[panelId] = {
        name,
        categoryId: null,
        panelChannelId,
        staffRoleId: null,
        logChannelId: null,
        title,
        description,
        color,
        image: null,
        bannerImage: null,
        thumbnailImage: null,
        openMessage: "Descreva seu problema e aguarde a equipe.",
        useTopic: false,
        useButton: true,
        useSelectMenu: false,
        ticketLimit: "global",
        button: {
          label: "Abrir Ticket",
          description: "Uma descricao boladona sobre o ticket.",
          emoji: null,
          color: "Success"
        },
        selectOptions: [],
        selectedSelectOptionId: null,
        schedule: null
      };
      cfg.ticket.selectedPanelId = panelId;
    });

    return interaction.update(ticketManageMenu(config, panelId));
  }

  if (interaction.customId === "modal:ticketConfig") {
    const panelChannelId = interaction.fields.getTextInputValue("panel").trim();
    const category = interaction.fields.getTextInputValue("category").trim();
    const staff = interaction.fields.getTextInputValue("staff").trim();
    const log = interaction.fields.getTextInputValue("log").trim();
    const openMessage = interaction.fields.getTextInputValue("openMessage").trim();
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panelId = cfg.ticket.selectedPanelId;
      if (!panelId || !cfg.ticketPanels[panelId]) return;
      cfg.ticketPanels[panelId].panelChannelId = panelChannelId || null;
      cfg.ticketPanels[panelId].categoryId = category || null;
      if (category) cfg.ticketPanels[panelId].useTopic = false;
      cfg.ticketPanels[panelId].staffRoleId = staff || null;
      cfg.ticketPanels[panelId].staffRoleIds = staff ? [staff] : [];
      cfg.ticketPanels[panelId].logChannelId = log || null;
      cfg.ticketPanels[panelId].openMessage = openMessage || cfg.ticketPanels[panelId].openMessage;
    });
    return interaction.update(ticketManageMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId === "modal:ticketRename") {
    const name = interaction.fields.getTextInputValue("name").trim().slice(0, 100);
    if (!name) return interaction.reply({ content: "Nome invalido.", flags: MessageFlags.Ephemeral });
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panelId = cfg.ticket.selectedPanelId;
      if (!panelId || !cfg.ticketPanels[panelId]) return;
      cfg.ticketPanels[panelId].name = name;
    });
    return interaction.update(ticketManageListMenu(config));
  }

  if (interaction.customId === "modal:ticketAppearance") {
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panelId = cfg.ticket.selectedPanelId;
      if (!panelId || !cfg.ticketPanels[panelId]) return;
      cfg.ticketPanels[panelId].name = interaction.fields.getTextInputValue("name").trim() || cfg.ticketPanels[panelId].name;
      cfg.ticketPanels[panelId].title = embedText(interaction, interaction.fields.getTextInputValue("title")) || cfg.ticketPanels[panelId].title;
      cfg.ticketPanels[panelId].description = embedText(interaction, interaction.fields.getTextInputValue("description")) || cfg.ticketPanels[panelId].description;
      cfg.ticketPanels[panelId].color = normalizeColor(interaction.fields.getTextInputValue("color").trim(), cfg.ticketPanels[panelId].color);
      cfg.ticketPanels[panelId].bannerImage = interaction.fields.getTextInputValue("image").trim() || cfg.ticketPanels[panelId].bannerImage || null;
      cfg.ticketPanels[panelId].image = cfg.ticketPanels[panelId].bannerImage;
    });
    return interaction.update(ticketManageMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId.startsWith("modal:ticketEmbedColor:")) {
    const kind = interaction.customId.split(":")[2];
    const color = normalizeColor(interaction.fields.getTextInputValue("color").trim(), "#2B6CFF");
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (!panel) return;
      const key = kind === "internal" ? "internalEmbed" : "panelEmbed";
      panel[key] = panel[key] || { color, items: [] };
      panel[key].color = color;
      if (kind === "panel") panel.color = color;
    });
    return interaction.update(ticketEmbedConfigMenu(config, kind));
  }

  if (interaction.customId.startsWith("modal:ticketEmbedText:")) {
    const [, , kind, itemId] = interaction.customId.split(":");
    const title = embedText(interaction, interaction.fields.getTextInputValue("title"));
    const description = embedText(interaction, interaction.fields.getTextInputValue("description"));
    const thumbnail = interaction.fields.getTextInputValue("thumbnail").trim();
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (!panel) return;
      const key = kind === "internal" ? "internalEmbed" : "panelEmbed";
      panel[key] = panel[key] || { color: panel.color || "#2B6CFF", items: [] };
      if (itemId === "new") {
        panel[key].items.push({ id: `item_${Date.now()}`, type: "text", title, description, thumbnail: thumbnail || null });
      } else {
        const item = panel[key].items.find(entry => entry.id === itemId);
        if (item) {
          item.title = title;
          item.description = description;
          item.thumbnail = thumbnail || null;
        }
      }
      if (kind === "panel") {
        panel.title = title || panel.title;
        panel.description = description || panel.description;
        if (thumbnail) panel.thumbnailImage = thumbnail;
      } else {
        panel.openMessage = description || title || panel.openMessage;
      }
    });
    return interaction.update(ticketEmbedConfigMenu(config, kind));
  }

  if (interaction.customId.startsWith("modal:ticketEmbedGallery:")) {
    const [, , kind, itemId] = interaction.customId.split(":");
    const images = parseImageLinks(interaction.fields.getTextInputValue("images"));
    if (!images.length) {
      const config = getGuildConfig(interaction.guild.id);
      const panelId = config.ticket.selectedPanelId;
      setUploadSession(interaction.guild.id, interaction.user.id, "ticket:embedImage", {
        kind,
        itemId,
        panelId,
        channelId: interaction.channelId,
        messageId: interaction.message?.id || null
      });
      return interaction.reply({ content: "Envie ate 10 imagens/GIFs como anexo ou cole links neste canal em ate 5 minutos.", flags: MessageFlags.Ephemeral });
    }
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (!panel) return;
      const key = kind === "internal" ? "internalEmbed" : "panelEmbed";
      panel[key] = panel[key] || { color: panel.color || "#2B6CFF", items: [] };
      if (itemId === "new") panel[key].items.push({ id: `item_${Date.now()}`, type: "gallery", images });
      else {
        const item = panel[key].items.find(entry => entry.id === itemId);
        if (item) item.images = images;
      }
      if (kind === "panel" && images[0]) {
        panel.bannerImage = images[0];
        panel.image = images[0];
      }
    });
    return interaction.update(ticketEmbedConfigMenu(config, kind));
  }

  if (interaction.customId.startsWith("modal:ticketEmbedSeparator:")) {
    const [, , kind, itemId] = interaction.customId.split(":");
    const type = interaction.fields.getTextInputValue("type").trim().toLowerCase();
    const spacing = interaction.fields.getTextInputValue("spacing").trim().toLowerCase();
    const remove = ["remover", "remove", "deletar", "delete"].includes(type);
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (!panel) return;
      const key = kind === "internal" ? "internalEmbed" : "panelEmbed";
      panel[key] = panel[key] || { color: panel.color || "#2B6CFF", items: [] };
      panel[key].items = normalizeTicketEmbedItems(panel[key].items || []);
      if (remove) {
        panel[key].items = panel[key].items.filter(entry => entry.id !== itemId);
        return;
      }
      const separator = {
        id: itemId === "new" ? `item_${Date.now()}` : itemId,
        type: "separator",
        line: type !== "espaco" && type !== "espaço" && type !== "sem linha",
        size: spacing === "grande" ? "grande" : "pequeno"
      };
      if (itemId === "new") panel[key].items.push(separator);
      else {
        const index = panel[key].items.findIndex(entry => entry.id === itemId);
        if (index >= 0) panel[key].items[index] = { ...panel[key].items[index], ...separator };
      }
    });
    return interaction.update(ticketEmbedConfigMenu(config, kind));
  }

  if (interaction.customId === "modal:ticketSchedule") {
    const schedule = interaction.fields.getTextInputValue("schedule").trim();
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) panel.schedule = schedule && schedule.toLowerCase() !== "n/a" ? schedule : null;
    });
    return interaction.update(ticketManageMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId === "modal:ticketSelectAdd" || interaction.customId === "modal:ticketSelectEdit") {
    const title = embedText(interaction, interaction.fields.getTextInputValue("title"));
    const description = embedText(interaction, interaction.fields.getTextInputValue("description"));
    const emoji = interaction.fields.getTextInputValue("emoji").trim();
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (!panel) return;
      panel.selectOptions = panel.selectOptions || [];
      if (interaction.customId === "modal:ticketSelectAdd") {
        const option = {
          id: `option_${Date.now()}`,
          title,
          description: description || null,
          emoji: emoji || null,
          roleIds: [],
          embed: null
        };
        panel.selectOptions.push(option);
        panel.selectedSelectOptionId = option.id;
        panel.useSelectMenu = true;
      } else {
        const option = panel.selectOptions.find(item => item.id === panel.selectedSelectOptionId);
        if (option) {
          option.title = title || option.title;
          option.description = description || null;
          option.emoji = emoji || null;
        }
      }
    });
    const panel = config.ticketPanels[config.ticket.selectedPanelId];
    return interaction.update(ticketSelectOptionMenu(config, panel.selectedSelectOptionId));
  }

  if (interaction.customId === "modal:ticketSelectEmbed") {
    const title = embedText(interaction, interaction.fields.getTextInputValue("title"));
    const description = embedText(interaction, interaction.fields.getTextInputValue("description"));
    const color = normalizeColor(interaction.fields.getTextInputValue("color").trim(), "#2B6CFF");
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      const option = panel?.selectOptions?.find(item => item.id === panel.selectedSelectOptionId);
      if (option) option.embed = { title, description, color };
    });
    const optionId = config.ticketPanels[config.ticket.selectedPanelId].selectedSelectOptionId;
    return interaction.update(ticketSelectOptionMenu(config, optionId));
  }

  if (interaction.customId === "modal:ticketSelectAdvanced") {
    const categoryId = interaction.fields.getTextInputValue("category").trim();
    const channelPrefix = interaction.fields.getTextInputValue("prefix").trim();
    const roleIds = interaction.fields.getTextInputValue("staff")
      .split(/[,\s]+/)
      .map(roleId => roleId.trim())
      .filter(roleId => /^\d{17,20}$/.test(roleId))
      .slice(0, 5);
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      const option = panel?.selectOptions?.find(item => item.id === panel.selectedSelectOptionId);
      if (!option) return;
      option.categoryId = /^\d{17,20}$/.test(categoryId) ? categoryId : null;
      if (option.categoryId) panel.useTopic = false;
      option.channelPrefix = sanitizeChannelPrefix(channelPrefix || option.title || "ticket");
      option.roleIds = roleIds;
    });
    const optionId = config.ticketPanels[config.ticket.selectedPanelId].selectedSelectOptionId;
    return interaction.update(ticketSelectOptionMenu(config, optionId));
  }

  if (interaction.customId === "modal:ticketButtonDescription") {
    const description = embedText(interaction, interaction.fields.getTextInputValue("description"));
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) {
        panel.button = panel.button || {};
        panel.button.description = description || panel.description;
      }
    });
    return interaction.update(ticketButtonMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId === "modal:ticketButtonEmoji") {
    const emoji = interaction.fields.getTextInputValue("emoji").trim();
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) {
        panel.button = panel.button || {};
        panel.button.emoji = emoji || null;
      }
    });
    return interaction.update(ticketButtonMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId === "modal:ticketButtonColor") {
    const color = interaction.fields.getTextInputValue("color").trim();
    const allowed = ["Primary", "Secondary", "Success", "Danger"];
    const normalized = allowed.find(item => item.toLowerCase() === color.toLowerCase()) || "Success";
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      const panel = cfg.ticketPanels[cfg.ticket.selectedPanelId];
      if (panel) {
        panel.button = panel.button || {};
        panel.button.color = normalized;
      }
    });
    return interaction.update(ticketButtonMenu(config, config.ticket.selectedPanelId));
  }

  if (interaction.customId === "modal:embedConfig") {
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.embed.title = embedText(interaction, interaction.fields.getTextInputValue("title")) || cfg.embed.title;
      cfg.embed.description = embedText(interaction, interaction.fields.getTextInputValue("description")) || cfg.embed.description;
      cfg.embed.color = normalizeColor(interaction.fields.getTextInputValue("color").trim(), cfg.embed.color);
      cfg.embed.image = interaction.fields.getTextInputValue("image").trim() || null;
      cfg.embed.footer = interaction.fields.getTextInputValue("footer").trim() || null;
    });
    return interaction.update(embedMenu(config, interaction.user, interaction.client.user));
  }

  if (interaction.customId === "modal:embedTemplateSave") {
    const name = interaction.fields.getTextInputValue("name").trim().toLowerCase();
    if (!name) return interaction.reply({ content: "Nome invalido.", flags: MessageFlags.Ephemeral });
    const config = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.embed.templates = cfg.embed.templates || {};
      cfg.embed.templates[name] = {
        title: cfg.embed.title,
        description: cfg.embed.description,
        color: cfg.embed.color,
        image: cfg.embed.image,
        thumbnail: cfg.embed.thumbnail,
        footer: cfg.embed.footer,
        author: cfg.embed.author,
        fields: cfg.embed.fields || []
      };
    });
    return interaction.update(embedMenu(config, interaction.user, interaction.client.user));
  }

  if (interaction.customId === "modal:embedTemplateLoad") {
    const name = interaction.fields.getTextInputValue("name").trim().toLowerCase();
    const config = getGuildConfig(interaction.guild.id);
    const template = config.embed.templates?.[name];
    if (!template) return interaction.reply({ content: "Template nao encontrado.", flags: MessageFlags.Ephemeral });
    const updated = saveGuildConfig(interaction.guild.id, cfg => {
      cfg.embed = { ...cfg.embed, ...template };
    });
    return interaction.update(embedMenu(updated, interaction.user, interaction.client.user));
  }

  if (interaction.customId.startsWith("modal:embedBuilder:")) {
    const [, , field, ownerId] = interaction.customId.split(":");
    const session = updateEmbedSession(interaction.guild.id, ownerId, current => {
      if (field === "button") {
        const label = interaction.fields.getTextInputValue("label").trim();
        const url = interaction.fields.getTextInputValue("url").trim();
        if (/^https?:\/\//i.test(url)) {
          current.buttons = current.buttons || [];
          current.buttons = [...current.buttons, { label, url }].slice(0, 5);
        }
        return;
      }
      if (field === "field") {
        const name = embedText(interaction, interaction.fields.getTextInputValue("name"));
        const value = embedText(interaction, interaction.fields.getTextInputValue("value"));
        const inline = yesNo(interaction.fields.getTextInputValue("inline"));
        current.fields = current.fields || [];
        current.fields = [...current.fields, { name, value, inline }].slice(0, 25);
        return;
      }
      const value = ["title", "description", "footer", "author"].includes(field)
        ? embedText(interaction, interaction.fields.getTextInputValue("value"))
        : interaction.fields.getTextInputValue("value").trim();
      if (field === "color") current.color = normalizeColor(value, current.color);
      else current[field] = value || null;
    });
    if (!session) return interaction.reply({ content: "Sessao de embed expirada. Use o comando novamente.", flags: MessageFlags.Ephemeral });
    const page = field === "button" ? "buttons" : field === "field" ? "fields" : ["thumbnail", "image"].includes(field) ? "images" : ["footer", "author"].includes(field) ? "extras" : "content";
    return interaction.update(embedBuilderPanel(session, ownerId, page));
  }

  if (interaction.customId.startsWith("modal:embedEdit:")) {
    const ownerId = interaction.customId.split(":")[2];
    const session = updateEmbedSession(interaction.guild.id, ownerId, current => {
      current.title = embedText(interaction, interaction.fields.getTextInputValue("title")) || current.title;
      current.description = embedText(interaction, interaction.fields.getTextInputValue("description")) || current.description;
      current.color = normalizeColor(interaction.fields.getTextInputValue("color").trim(), current.color);
      current.image = interaction.fields.getTextInputValue("image").trim() || null;
      current.footer = interaction.fields.getTextInputValue("footer").trim() || null;
    });
    if (!session) return interaction.reply({ content: "Sessao de embed expirada. Use o comando novamente.", flags: MessageFlags.Ephemeral });
    return interaction.update(embedBuilderPanel(session, ownerId));
  }
}

async function promptTicketInput(interaction, type, content, data = {}) {
  const config = getGuildConfig(interaction.guild.id);
  const panelId = data.panelId || config.ticket.selectedPanelId;
  setUploadSession(interaction.guild.id, interaction.user.id, type, {
    ...data,
    panelId,
    channelId: interaction.channelId,
    messageId: interaction.message?.id || null
  });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return interaction.editReply({ content });
}

function normalizeTicketEmbedItems(items) {
  return (items || [])
    .filter(item => item && typeof item === "object")
    .map((item, index) => ({
      ...item,
      id: item.id || `legacy_item_${index}`
    }));
}

function parseImageLinks(value) {
  return String(value || "")
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(item => /^https?:\/\/\S+/i.test(item))
    .slice(0, 10);
}

function sanitizeChannelPrefix(value) {
  return String(value || "ticket")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "ticket";
}

function formatTemplate(template, member) {
  return String(template || "Bem-vindo {member} ao {servername}!")
    .replaceAll("{member}", `${member}`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{servername}", member.guild.name);
}

function embedText(interaction, value) {
  return resolveGuildEmojiText(interaction.guild, String(value || "").trim());
}

module.exports = {
  handleInteractionCreate
};

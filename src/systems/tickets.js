const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require("discord.js");
const { getGuildConfig, saveGuildConfig } = require("../database/guildStore");
const { normalizeColor, safeChannel } = require("../utils/discord");
const { isTicketStaff } = require("../utils/permissions");
const { logEmbed, sendLog } = require("../utils/logs");

async function sendTicketPanel(interaction, config) {
  const panel = getTicketPanel(config, config.ticket.selectedPanelId);
  const channel = safeChannel(interaction.guild, panel.panelChannelId) || interaction.channel;
  const validation = validateTicketPanel(interaction.guild, panel, channel);
  if (validation.length) {
    return interaction.reply({
      content: `Antes de enviar o painel, corrija:\n${validation.map(item => `- ${item}`).join("\n")}`,
      ephemeral: true
    });
  }

  const embed = buildTicketEmbed(panel, "panel", config);

  const components = [];
  if (panel.useSelectMenu && panel.selectOptions?.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket:open:${panel.id}`)
        .setPlaceholder("Selecione uma opcao...")
        .addOptions(panel.selectOptions.slice(0, 25).map(option => ({
          label: option.title.slice(0, 100),
          value: option.id,
          description: (option.description || "Abrir ticket").slice(0, 100),
          emoji: cleanEmoji(option.emoji)
        })))
    ));
  }

  if (panel.useButton !== false) {
    const button = panel.button || {};
    const builder = new ButtonBuilder()
      .setCustomId(`ticket:open:${panel.id}`)
      .setLabel(button.label || "Abrir Ticket")
      .setStyle(buttonStyle(button.color));
    const emoji = cleanEmoji(button.emoji);
    if (emoji) builder.setEmoji(emoji);
    components.push(new ActionRowBuilder().addComponents(builder));
  }

  const sent = await channel.send({ embeds: [embed], components }).catch(error => ({ error }));
  if (sent?.error) {
    return interaction.reply({ content: `Nao consegui enviar o painel: ${sent.error.message}`, ephemeral: true });
  }
  return interaction.reply({ content: `Painel enviado em ${channel}.`, ephemeral: true });
}

async function openTicket(interaction) {
  const config = getGuildConfig(interaction.guild.id);
  const panelId = interaction.customId.split(":")[2] || config.ticket.selectedPanelId;
  const basePanel = getTicketPanel(config, panelId);
  const optionId = interaction.isStringSelectMenu?.() ? interaction.values?.[0] : null;
  const option = optionId ? (basePanel.selectOptions || []).find(item => item.id === optionId) : null;
  const panel = applyTicketOption(basePanel, option);
  const existing = findExistingTicket(config, interaction.user.id, panel);
  if (existing) return interaction.reply({ content: `Voce ja tem um ticket aberto: <#${existing[0]}>`, ephemeral: true });
  await interaction.deferReply({ ephemeral: true });

  const updated = saveGuildConfig(interaction.guild.id, cfg => { cfg.ticket.counter += 1; });
  const number = String(updated.ticket.counter).padStart(4, "0");
  const overwrites = [
    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: interaction.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ReadMessageHistory] }
  ];
  const staffRoles = panel.staffRoleIds?.length ? panel.staffRoleIds : (panel.staffRoleId ? [panel.staffRoleId] : []);
  for (const roleId of staffRoles) {
    overwrites.push({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
  }

  const panelChannel = safeChannel(interaction.guild, panel.panelChannelId) || interaction.channel;
  let channel;

  if (panel.useTopic && panelChannel?.threads) {
    channel = await panelChannel.threads.create({
      name: `${sanitizeChannelPrefix(panel.channelPrefix || "ticket")}-${number}`,
      type: ChannelType.PrivateThread,
      autoArchiveDuration: 1440,
      invitable: false,
      reason: `Ticket de ${interaction.user.tag} (${interaction.user.id})`
    }).catch(() => null);
    if (channel?.members?.add) await channel.members.add(interaction.user.id).catch(() => null);
  }

  if (!channel) {
    channel = await interaction.guild.channels.create({
      name: `${sanitizeChannelPrefix(panel.channelPrefix || "ticket")}-${number}`,
      type: ChannelType.GuildText,
      parent: panel.categoryId || interaction.channel?.parentId || undefined,
      permissionOverwrites: overwrites,
      topic: `Ticket de ${interaction.user.tag} (${interaction.user.id})`
    }).catch(error => ({ error }));
  }

  if (channel?.error) {
    return interaction.editReply({ content: `Nao consegui abrir o ticket: ${channel.error.message}` });
  }

  saveGuildConfig(interaction.guild.id, cfg => {
    cfg.tickets[channel.id] = { ownerId: interaction.user.id, panelId: panel.id, optionId: option?.id || null, open: true, claimedBy: null, createdAt: Date.now() };
  });

  const embed = buildTicketEmbed(panel, "internal", config);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:claim").setLabel("Assumir").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:close").setLabel("Fechar").setStyle(ButtonStyle.Danger)
  );
  const staffMentions = staffRoles.map(roleId => `<@&${roleId}>`).join(" ");
  await channel.send({ content: `${interaction.user}${staffMentions ? ` ${staffMentions}` : ""}`, embeds: [embed], components: [row] }).catch(() => null);
  await interaction.editReply(ticketOpenedReply(interaction, channel, config));
  return sendLog(interaction.guild, "ticket", logEmbed("Ticket aberto", `${interaction.user} abriu ${channel}${option ? ` pela opcao **${option.title}**` : ""}.`, config.menuColor));
}

function getTicketPanel(config, panelId) {
  const panels = config.ticketPanels || {};
  if (panelId && panels[panelId]) return { id: panelId, ...panels[panelId] };
  if (config.ticket.selectedPanelId && panels[config.ticket.selectedPanelId]) {
    return { id: config.ticket.selectedPanelId, ...panels[config.ticket.selectedPanelId] };
  }

  return {
    id: "default",
    name: "Ticket padrao",
    categoryId: config.ticket.categoryId,
    panelChannelId: config.ticket.panelChannelId,
    staffRoleId: config.ticket.staffRoleId,
    staffRoleIds: config.ticket.staffRoleId ? [config.ticket.staffRoleId] : [],
    logChannelId: config.ticket.logChannelId,
    title: config.ticket.title,
    description: config.ticket.description,
    color: config.ticket.color,
    image: config.ticket.image,
    bannerImage: config.ticket.bannerImage || config.ticket.image,
    thumbnailImage: config.ticket.thumbnailImage || null,
    openMessage: config.ticket.openMessage,
    ticketLimit: config.ticket.ticketLimit || "global"
  };
}

function buildTicketEmbed(panel, kind, config) {
  const data = kind === "internal" ? panel.internalEmbed : panel.panelEmbed;
  const items = data?.items || [];
  const firstText = items.find(item => item.type === "text");
  const gallery = items.find(item => item.type === "gallery");
  const embed = new EmbedBuilder()
    .setDescription(renderItems(items, kind === "internal" ? panel.openMessage : panel.description))
    .setColor(normalizeColor(data?.color || panel.color || config.menuColor));
  const banner = panel.bannerImage || panel.image || null;
  const thumbnail = panel.thumbnailImage || null;
  if (firstText?.thumbnail) embed.setThumbnail(firstText.thumbnail);
  else if (thumbnail) embed.setThumbnail(thumbnail);
  if (banner && kind === "panel") embed.setImage(banner);
  if (gallery?.images?.[0]) embed.setImage(gallery.images[0]);
  return embed;
}

function renderItems(items, fallback) {
  if (!items.length) return fallback || "Configure esta embed.";
  return items.map(item => {
    if (item.type === "separator") return renderSeparator(item);
    if (item.type === "gallery") return "";
    return renderTextItem(item);
  }).filter(Boolean).join("\n") || fallback || "Configure esta embed.";
}

function renderTextItem(item) {
  return [
    item.title ? `# ${item.title}` : null,
    item.description || null
  ].filter(Boolean).join("\n");
}

function renderSeparator(item) {
  const spacing = item.size === "grande" ? "\n\n" : "\n";
  return item.line ? `----------------------------------------${spacing}` : spacing;
}

function buttonStyle(style) {
  const styles = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger
  };
  return styles[style] || ButtonStyle.Success;
}

function cleanEmoji(value) {
  const emoji = String(value || "").trim();
  if (!emoji) return undefined;
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(emoji)) return emoji;
  if (/^\d{17,20}$/.test(emoji)) return emoji;
  if (!/[a-zA-Z0-9_]/.test(emoji) && emoji.length <= 8) return emoji;
  return undefined;
}

async function claimTicket(interaction) {
  const config = getGuildConfig(interaction.guild.id);
  if (!isTicketStaff(interaction.member, config)) return interaction.reply({ content: "Apenas a equipe pode assumir tickets.", ephemeral: true });
  const ticket = config.tickets[interaction.channel.id];
  if (!ticket?.open) return interaction.reply({ content: "Este canal nao e um ticket aberto.", ephemeral: true });
  saveGuildConfig(interaction.guild.id, cfg => { cfg.tickets[interaction.channel.id].claimedBy = interaction.user.id; });
  await interaction.reply(`${interaction.user} assumiu este ticket.`);
  return sendLog(interaction.guild, "ticket", logEmbed("Ticket assumido", `${interaction.user} assumiu ${interaction.channel}.`, config.menuColor));
}

async function closeTicket(interaction, reason = "Sem motivo informado.") {
  const config = getGuildConfig(interaction.guild.id);
  const ticket = config.tickets[interaction.channel.id];
  if (!ticket?.open) return interaction.reply({ content: "Este canal nao e um ticket aberto.", ephemeral: true });
  if (interaction.user.id !== ticket.ownerId && !isTicketStaff(interaction.member, config)) {
    return interaction.reply({ content: "Voce nao pode fechar este ticket.", ephemeral: true });
  }

  const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
  const transcript = messages
    ? buildTranscript(messages.reverse(), {
      channel: interaction.channel,
      closedBy: interaction.user,
      reason,
      ticket
    })
    : "Nao foi possivel gerar transcript.";

  saveGuildConfig(interaction.guild.id, cfg => {
    cfg.tickets[interaction.channel.id].open = false;
    cfg.tickets[interaction.channel.id].closedAt = Date.now();
    cfg.tickets[interaction.channel.id].closedBy = interaction.user.id;
    cfg.tickets[interaction.channel.id].closeReason = reason;
  });

  if (interaction.channel.permissionOverwrites?.edit) {
    await interaction.channel.permissionOverwrites.edit(ticket.ownerId, { SendMessages: false, ViewChannel: false }).catch(() => null);
  }
  await interaction.reply(`Ticket fechado. Motivo: **${reason.slice(0, 120)}**\nEste canal sera apagado em 10 segundos.`);

  const panel = getTicketPanel(config, ticket.panelId);
  const logChannel = safeChannel(interaction.guild, panel.logChannelId || config.logs.ticket || config.logs.basic);
  if (logChannel?.isTextBased()) {
    await logChannel.send({
      embeds: [logEmbed("Ticket fechado", `${interaction.user} fechou ${interaction.channel}.\nMotivo: **${reason}**`, config.menuColor)],
      files: [{ attachment: Buffer.from(transcript, "utf8"), name: `${interaction.channel.name}-transcript.txt` }]
    }).catch(() => null);
  }

  setTimeout(() => interaction.channel.delete("Ticket fechado").catch(() => null), 10_000);
}

function validateTicketPanel(guild, panel, channel) {
  const errors = [];
  if (!channel?.isTextBased?.()) errors.push("canal do painel invalido ou inacessivel");
  const permissions = channel?.permissionsFor?.(guild.members.me);
  if (channel && !permissions?.has(PermissionsBitField.Flags.SendMessages)) errors.push(`sem permissao para enviar mensagens em ${channel}`);
  if (channel && !permissions?.has(PermissionsBitField.Flags.EmbedLinks)) errors.push(`sem permissao de Enviar Links/Embeds em ${channel}`);
  if (!panel.useButton && !(panel.useSelectMenu && panel.selectOptions?.length)) errors.push("ative botao ou menu de selecao");
  if (panel.useSelectMenu && !panel.selectOptions?.length) errors.push("adicione pelo menos uma opcao ao menu de selecao");

  const staffRoles = panel.staffRoleIds?.length ? panel.staffRoleIds : (panel.staffRoleId ? [panel.staffRoleId] : []);
  const missingRoles = staffRoles.filter(roleId => !guild.roles.cache.has(roleId));
  if (missingRoles.length) errors.push(`cargo staff nao encontrado: ${missingRoles.join(", ")}`);
  if (panel.categoryId && !guild.channels.cache.get(panel.categoryId)) errors.push("categoria configurada nao existe");
  for (const option of panel.selectOptions || []) {
    if (option.categoryId && !guild.channels.cache.get(option.categoryId)) errors.push(`categoria da opcao "${option.title}" nao existe`);
    const optionMissingRoles = (option.roleIds || []).filter(roleId => !guild.roles.cache.has(roleId));
    if (optionMissingRoles.length) errors.push(`cargo staff da opcao "${option.title}" nao encontrado: ${optionMissingRoles.join(", ")}`);
  }
  if (panel.bannerImage && !isValidImageUrl(panel.bannerImage)) errors.push("banner tem URL invalida");
  if (panel.thumbnailImage && !isValidImageUrl(panel.thumbnailImage)) errors.push("thumbnail tem URL invalida");
  return errors;
}

function findExistingTicket(config, ownerId, panel) {
  return Object.entries(config.tickets || {}).find(([, data]) => {
    if (!data?.open || data.ownerId !== ownerId) return false;
    return panel.ticketLimit === "panel" ? data.panelId === panel.id : true;
  });
}

function applyTicketOption(panel, option) {
  if (!option) return panel;
  return {
    ...panel,
    selectedOptionId: option.id,
    categoryId: option.categoryId || panel.categoryId,
    staffRoleIds: option.roleIds?.length ? option.roleIds : panel.staffRoleIds,
    staffRoleId: option.roleIds?.[0] || panel.staffRoleId,
    channelPrefix: option.channelPrefix || panel.channelPrefix || option.title || "ticket",
    internalEmbed: option.embed ? { color: option.embed.color || panel.color, items: [{ id: `option_${option.id}`, type: "text", title: option.embed.title || option.title, description: option.embed.description || option.description || "" }] } : panel.internalEmbed,
    openMessage: option.embed?.description || panel.openMessage
  };
}

function buildTranscript(messages, meta) {
  const header = [
    `Canal: #${meta.channel.name} (${meta.channel.id})`,
    `Dono: ${meta.ticket.ownerId}`,
    `Fechado por: ${meta.closedBy.tag} (${meta.closedBy.id})`,
    `Motivo: ${meta.reason}`,
    ""
  ].join("\n");
  const body = messages.map(msg => {
    const attachments = msg.attachments?.size
      ? `\nAnexos: ${msg.attachments.map(attachment => attachment.url).join(", ")}`
      : "";
    const embeds = msg.embeds?.length ? `\nEmbeds: ${msg.embeds.length}` : "";
    return `[${msg.createdAt.toISOString()}] ${msg.author.tag} (${msg.author.id}): ${msg.cleanContent || "(sem texto)"}${attachments}${embeds}`;
  }).join("\n\n");
  return `${header}${body || "Sem mensagens."}`;
}

function isValidImageUrl(value) {
  return /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(String(value || "")) || /^https?:\/\/(?:cdn|media)\.discordapp\./i.test(String(value || ""));
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

function ticketOpenedReply(interaction, channel, config) {
  const embed = new EmbedBuilder()
    .setColor(normalizeColor(config.menuColor))
    .setDescription(`${interaction.user}, seu atendimento foi iniciado!`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Ir para o ticket")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${interaction.guild.id}/${channel.id}`)
  );

  return { content: null, embeds: [embed], components: [row] };
}

async function deleteTicket(interaction) {
  const config = getGuildConfig(interaction.guild.id);
  if (!isTicketStaff(interaction.member, config)) return interaction.reply({ content: "Apenas a equipe pode deletar tickets.", ephemeral: true });
  await interaction.reply("Deletando ticket em 5 segundos...");
  setTimeout(() => interaction.channel.delete("Ticket deletado").catch(() => null), 5000);
}

module.exports = {
  claimTicket,
  closeTicket,
  deleteTicket,
  buildTicketEmbed,
  getTicketPanel,
  openTicket,
  sendTicketPanel
};

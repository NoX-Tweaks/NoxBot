const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField
} = require("discord.js");
const { execFileSync } = require("child_process");
const { getDatabaseStatus, getGuildConfig, saveGuildConfig } = require("../database/guildStore");
const { mainMenu } = require("../ui/menus");
const {
  ticketButtonMenu,
  ticketEmbedConfigMenu,
  ticketImageMenu,
  ticketManageMenu,
  ticketSelectOptionMenu
} = require("../ui/menus");
const { hasMenuAccess } = require("../utils/permissions");
const { normalizeColor, resolveGuildEmojiText } = require("../utils/discord");
const { guildEmbed } = require("../utils/logs");
const { runMessageSecurity } = require("../systems/security");
const { getRecentErrors } = require("../systems/errorStore");
const {
  createEmbedSession,
  createNewEmbedSession,
  embedBuilderPanel,
  embedEditorMessage,
  takeUploadSession,
  updateEmbedSession
} = require("../systems/embedEditor");

async function handleMessageCreate(message) {
  if (!message.guild || message.author.bot) return;
  const config = getGuildConfig(message.guild.id);
  const rawContent = message.content.trim();
  const lowerContent = rawContent.toLowerCase();

  if (isDevCommand(lowerContent, config.prefix)) {
    return handleDevCommand(message, config);
  }

  const uploadSession = takeUploadSession(message.guild.id, message.author.id);
  if (uploadSession) {
    if (uploadSession.type?.startsWith("ticket:")) {
      return handleTicketChatInput(message, uploadSession);
    }
    const attachment = message.attachments.first();
    const attachmentUrl = attachment ? getAttachmentImageUrl(attachment) : null;
    if (!attachmentUrl) {
      return message.reply("Envie uma imagem anexada para aplicar essa personalizacao.").catch(() => null);
    }
    if (uploadSession.type === "embedImage" || uploadSession.type === "embedThumbnail") {
      const field = uploadSession.type === "embedImage" ? "image" : "thumbnail";
      const session = updateEmbedSession(message.guild.id, message.author.id, current => {
        current[field] = attachmentUrl;
      });
      if (!session) return message.reply("Sessao de embed expirada. Use o comando novamente.").catch(() => null);
      return message.reply({ content: "Imagem salva na embed.", ...embedBuilderPanel(session, message.author.id, uploadSession.page || "images") }).catch(() => null);
    }
    if (uploadSession.type === "avatar") {
      await message.client.user.setAvatar(attachmentUrl).catch(() => null);
      return message.reply("Icon do bot atualizado com o arquivo enviado.").catch(() => null);
    }
    if (uploadSession.type === "banner" && typeof message.client.user.setBanner === "function") {
      await message.client.user.setBanner(attachmentUrl).catch(() => null);
      return message.reply("Banner do bot atualizado com o arquivo enviado.").catch(() => null);
    }
    if (uploadSession.type === "welcomeImage") {
      const updated = saveGuildConfig(message.guild.id, cfg => {
        cfg.welcome.image = attachmentUrl;
      });
      const { serverSectionMenu } = require("../ui/menus");
      await message.delete().catch(() => null);
      return message.reply({ content: "Imagem de boas-vindas salva.", ...serverSectionMenu(updated, "welcome") }).catch(() => null);
    }
    return message.reply("Nao consegui aplicar esse arquivo. Verifique se o bot tem suporte a banner.").catch(() => null);
  }

  await runMessageSecurity(message, config);
  if (!message.content.startsWith(config.prefix)) return;

  const [command, subcommand] = message.content.slice(config.prefix.length).trim().split(/\s+/);
  const cmd = command?.toLowerCase();

  if (cmd === "menu") {
    if (!hasMenuAccess(message.member)) {
      return message.reply(`${message.member}, voce nao tem acesso ao painel. Peca para alguem que tenha permissao liberar voce com \`${config.prefix}perm add @usuario\`.`).catch(() => null);
    }
    return message.reply(mainMenu(config, message.author, message.client.user)).catch(() => null);
  }

  if (cmd === "help") {
    const p = config.prefix;
    const embed = new EmbedBuilder()
      .setTitle("Ajuda Nox Tweaks")
      .setColor(config.menuColor)
      .setDescription(`Prefixo atual: \`${p}\``)
      .addFields(
        { name: `${p}menu`, value: "Abre o menu principal de configuracao." },
        { name: `${p}perm add @usuario`, value: "Da acesso ao menu para um usuario." },
        { name: `${p}perm remove @usuario`, value: "Remove o acesso ao menu de um usuario." },
        { name: `${p}perm list`, value: "Mostra usuarios com acesso ao menu." },
        { name: `${p}bot-call`, value: "Abre o painel de call 24/7." },
        { name: `${p}site`, value: "Mostra o link oficial da Nox Tweaks." },
        { name: `${p}embed editar <id_mensagem>`, value: "Abre o editor visual de uma embed enviada pelo bot." },
        { name: `${p}help`, value: "Mostra esta mensagem." }
      )
      .setFooter({ text: "O prefixo inicial e x, mas pode ser alterado em Personalizar." });

    return message.reply({ embeds: [embed] }).catch(() => null);
  }

  if (cmd === "bot-call") {
    if (!hasMenuAccess(message.member)) {
      return message.reply(`${message.member}, voce nao tem acesso ao painel. Peca para alguem que tenha permissao liberar voce com \`${config.prefix}perm add @usuario\`.`).catch(() => null);
    }

    return message.reply(callPanel(message.guild, config)).catch(() => null);
  }

  if (cmd === "site") {
    const embed = new EmbedBuilder()
      .setTitle("Nox Tweaks")
      .setDescription([
        "Acesse o site oficial da Nox Tweaks pelo botao abaixo.",
        "Produtos, suporte e novidades ficam centralizados por la."
      ].join("\n"))
      .setColor(config.menuColor)
      .setThumbnail(message.client.user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: "Nox Tweaks" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Abrir Site")
        .setStyle(ButtonStyle.Link)
        .setURL("https://www.noxtweaks.com/")
    );

    return message.reply({ embeds: [embed], components: [row] }).catch(() => null);
  }

  if (cmd === "addemoji") {
    if (!hasMenuAccess(message.member)) {
      return message.reply(`${message.member}, voce nao tem acesso ao painel. Peca para alguem que tenha permissao liberar voce com \`${config.prefix}perm add @usuario\`.`).catch(() => null);
    }

    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuildExpressions)) {
      return message.reply("Voce precisa da permissao Gerenciar Expressoes para adicionar emojis.").catch(() => null);
    }

    const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
    const emojiInputs = collectEmojiInputs(message, args.slice(1)).slice(0, 10);
    if (!emojiInputs.length) {
      return message.reply(`Use: \`${config.prefix}addemoji <emoji_ou_url...> [nome]\` ou envie ate 10 imagens anexadas.`).catch(() => null);
    }

    const singleCustomName = emojiInputs.length === 1 ? args[2] : null;
    const results = [];
    for (const [index, input] of emojiInputs.entries()) {
      const name = uniqueEmojiName(message.guild, singleCustomName || input.name || `emoji_${index + 1}`, index);
      const created = await message.guild.emojis.create({ attachment: input.url, name }).catch(error => ({ error }));
      results.push({ input, name, created });
    }

    const success = results.filter(item => !item.created?.error);
    const failed = results.filter(item => item.created?.error);
    const lines = [
      success.length ? `Adicionados (${success.length}): ${success.map(item => `${item.created}`).join(" ")}` : null,
      failed.length ? `Falharam (${failed.length}): ${failed.map(item => `\`${item.name}\` (${item.created.error.message})`).join(", ")}` : null
    ].filter(Boolean);

    return message.reply(lines.join("\n").slice(0, 1900)).catch(() => null);
  }

  if (cmd === "embed") {
    if (!hasMenuAccess(message.member)) {
      return message.reply(`${message.member}, voce nao tem acesso ao painel. Peca para alguem que tenha permissao liberar voce com \`${config.prefix}perm add @usuario\`.`).catch(() => null);
    }

    const args = message.content.slice(config.prefix.length).trim().split(/\s+/);

    if (!subcommand) {
      return message.reply(embedUsage(message, config)).catch(() => null);
    }

    if (subcommand !== "editar") {
      const channel = parseTextChannel(message, subcommand);
      if (!channel) return message.reply(embedUsage(message, config)).catch(() => null);
      const session = createNewEmbedSession(message.guild.id, message.author.id, channel.id);
      return message.reply(embedBuilderPanel(session, message.author.id)).catch(() => null);
    }

    const messageId = args[2];
    if (!messageId) {
      return message.reply(embedUsage(message, config)).catch(() => null);
    }

    const targetMessage = await findMessageById(message.guild, messageId);
    const targetEmbed = targetMessage?.embeds?.[0];
    if (!targetMessage || !targetEmbed) {
      return message.reply("Nao encontrei uma mensagem com embed nos canais que consigo acessar.").catch(() => null);
    }

    const session = createEmbedSession(message.guild.id, message.author.id, targetMessage.channel.id, targetMessage.id, targetEmbed);
    return message.reply(embedBuilderPanel(session, message.author.id)).catch(() => null);
  }

  if (cmd === "perm") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && message.guild.ownerId !== message.author.id) {
      return message.reply("Apenas administradores podem gerenciar permissoes do menu.").catch(() => null);
    }

    const user = message.mentions.users.first();
    if (subcommand === "add" && user) {
      saveGuildConfig(message.guild.id, cfg => {
        if (!cfg.menuUsers.includes(user.id)) cfg.menuUsers.push(user.id);
      });
      return message.reply(`${user} agora pode usar o menu.`).catch(() => null);
    }

    if (subcommand === "remove" && user) {
      saveGuildConfig(message.guild.id, cfg => {
        cfg.menuUsers = cfg.menuUsers.filter(id => id !== user.id);
      });
      return message.reply(`${user} perdeu o acesso ao menu.`).catch(() => null);
    }

    if (subcommand === "list") {
      const list = config.menuUsers.map(id => `<@${id}>`).join("\n") || "Nenhum usuario liberado.";
      return message.reply({ embeds: [guildEmbed(message.guild, "Usuarios com acesso ao menu", list)] }).catch(() => null);
    }

    return message.reply(`Use: \`${config.prefix}perm add @usuario\`, \`${config.prefix}perm remove @usuario\` ou \`${config.prefix}perm list\`.`).catch(() => null);
  }
}

async function handleDevCommand(message, config) {
  await message.delete().catch(() => null);

  if (!isDevUser(message)) {
    await message.author.send([
      "Comando dev negado.",
      `ID que o bot recebeu: \`${message.author.id}\``,
      "Confira se esse ID esta em `DEV_IDS` na hospedagem e reinicie o bot."
    ].join("\n")).catch(() => null);
    return;
  }

  const database = await getDatabaseStatus();
  const lastCommit = getLastCommitInfo();
  const menuUsers = config.menuUsers || [];
  const uptime = formatDuration(process.uptime() * 1000);
  const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const databaseLine = database.online
    ? `${database.type} online${database.pingMs !== null ? ` (${database.pingMs}ms)` : ""}`
    : `${database.type} offline${database.error ? `: ${database.error}` : ""}`;

  const embed = new EmbedBuilder()
    .setTitle("Painel Dev")
    .setColor(config.menuColor || "#2B6CFF")
    .setThumbnail(message.client.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Bot", value: [
        `Ping WS: **${Math.round(message.client.ws.ping)}ms**`,
        `Uptime: **${uptime}**`,
        `Memoria: **${memoryMb} MB**`,
        `Servidores: **${message.client.guilds.cache.size}**`
      ].join("\n"), inline: true },
      { name: "Banco de dados", value: databaseLine, inline: true },
      { name: "Servidor", value: [
        `Nome: **${message.guild.name}**`,
        `Membros: **${message.guild.memberCount ?? "N/A"}**`,
        `Canais: **${message.guild.channels.cache.size}**`
      ].join("\n"), inline: false },
      { name: "Menu", value: [
        `Membros adicionados: **${menuUsers.length}**`,
        menuUsers.length ? menuUsers.map(id => `<@${id}>`).slice(0, 20).join("\n") : "Nenhum usuario liberado."
      ].join("\n"), inline: false },
      { name: "Ultimo commit", value: [
        `Hash: \`${lastCommit.hash}\``,
        `Autor: **${lastCommit.author}**`,
        `Data: **${lastCommit.date}**`,
        `Mensagem: ${lastCommit.message}`
      ].join("\n").slice(0, 1024), inline: false }
    )
    .setFooter({ text: `Node ${process.version}` })
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dev:diagnostic:${message.guild.id}`).setLabel("Diagnostico").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`dev:tickets:${message.guild.id}`).setLabel("Tickets").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`dev:permissions:${message.guild.id}`).setLabel("Permissoes").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`dev:export:${message.guild.id}`).setLabel("Exportar Config").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`dev:errors:${message.guild.id}`).setLabel("Ultimos Erros").setStyle(ButtonStyle.Danger)
  );
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dev:close:${message.guild.id}`).setLabel("Apagar Painel").setStyle(ButtonStyle.Danger)
  );

  const sent = await message.author.send({ embeds: [embed, devSupportEmbed(message.guild, config)], components: [buttons, closeRow] }).catch(() => null);
  if (!sent) {
    const warning = await message.channel.send(`${message.author}, nao consegui te mandar DM. Ative suas mensagens privadas e mande \`dev\` de novo.`).catch(() => null);
    if (warning) setTimeout(() => warning.delete().catch(() => null), 8000);
  }
}

function devSupportEmbed(guild, config) {
  const invalid = findInvalidConfig(guild, config);
  const openTickets = Object.values(config.tickets || {}).filter(ticket => ticket?.open).length;
  const closedTickets = Object.values(config.tickets || {}).filter(ticket => ticket && !ticket.open).length;
  return new EmbedBuilder()
    .setTitle("Relatorio de Suporte")
    .setColor(config.menuColor || "#2B6CFF")
    .setDescription([
      `Servidor: **${guild.name}** (\`${guild.id}\`)`,
      `Tickets: **${openTickets}** abertos / **${closedTickets}** fechados`,
      `Paineis de ticket: **${Object.keys(config.ticketPanels || {}).length}**`,
      `Logs configurados: **${Object.values(config.logs || {}).filter(Boolean).length}**`,
      `Seguranca: **${config.security?.enabled ? "ativada" : "desativada"}**`,
      `Problemas encontrados: **${invalid.length}**`,
      invalid.length ? invalid.slice(0, 8).map(item => `- ${item}`).join("\n") : "Checklist basico OK."
    ].join("\n"));
}

function findInvalidConfig(guild, config) {
  const problems = [];
  for (const [key, channelId] of Object.entries(config.logs || {})) {
    if (channelId && !guild.channels.cache.has(channelId)) problems.push(`Log ${key}: canal inexistente`);
  }
  if (config.welcome?.channelId && !guild.channels.cache.has(config.welcome.channelId)) problems.push("Boas-vindas: canal inexistente");
  for (const [id, panel] of Object.entries(config.ticketPanels || {})) {
    if (panel.panelChannelId && !guild.channels.cache.has(panel.panelChannelId)) problems.push(`Ticket ${id}: canal do painel inexistente`);
    if (panel.categoryId && !guild.channels.cache.has(panel.categoryId)) problems.push(`Ticket ${id}: categoria inexistente`);
    for (const roleId of panel.staffRoleIds || []) {
      if (!guild.roles.cache.has(roleId)) problems.push(`Ticket ${id}: cargo staff inexistente`);
    }
  }
  return problems;
}

function buildDevDiagnostic(guild, config) {
  const invalid = findInvalidConfig(guild, config);
  const errors = getRecentErrors(5);
  return new EmbedBuilder()
    .setTitle("Diagnostico Dev")
    .setColor(config.menuColor || "#2B6CFF")
    .setDescription([
      `Node: **${process.version}**`,
      `Plataforma: **${process.platform}**`,
      `PID: **${process.pid}**`,
      `Memoria RSS: **${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB**`,
      `Banco/config: **${process.env.MONGO_URI ? "MongoDB configurado" : "JSON local"}**`,
      `TOKEN: **${process.env.TOKEN ? "definido" : "faltando"}**`,
      `DEV_IDS: **${process.env.DEV_IDS || process.env.DEV_ID ? "definido" : "faltando"}**`,
      "",
      "**Configs invalidas**",
      invalid.length ? invalid.slice(0, 12).map(item => `- ${item}`).join("\n") : "Nenhuma encontrada.",
      "",
      "**Erros recentes**",
      errors.length ? errors.map(error => `- ${error.source}: ${error.message}`).join("\n").slice(0, 900) : "Nenhum erro registrado."
    ].join("\n"));
}

function buildDevTickets(guild, config) {
  const tickets = Object.entries(config.tickets || {});
  const open = tickets.filter(([, ticket]) => ticket?.open);
  return new EmbedBuilder()
    .setTitle("Tickets - Suporte Dev")
    .setColor(config.menuColor || "#2B6CFF")
    .setDescription([
      `Paineis: **${Object.keys(config.ticketPanels || {}).length}**`,
      `Abertos: **${open.length}**`,
      `Fechados: **${tickets.length - open.length}**`,
      "",
      open.length ? open.slice(0, 15).map(([channelId, ticket]) => `<#${channelId}> | dono <@${ticket.ownerId}> | painel \`${ticket.panelId}\``).join("\n") : "Nenhum ticket aberto."
    ].join("\n"));
}

function buildDevPermissions(guild, config) {
  const me = guild.members.me;
  const flags = [
    "Administrator",
    "ManageChannels",
    "ManageRoles",
    "ManageMessages",
    "EmbedLinks",
    "AttachFiles",
    "ReadMessageHistory",
    "Connect",
    "Speak"
  ];
  return new EmbedBuilder()
    .setTitle("Permissoes do Bot")
    .setColor(config.menuColor || "#2B6CFF")
    .setDescription(flags.map(name => {
      const flag = PermissionsBitField.Flags[name];
      return `${me?.permissions?.has(flag) ? "OK" : "FALTA"} - ${name}`;
    }).join("\n"));
}

function buildDevErrors(config) {
  const errors = getRecentErrors(10);
  return new EmbedBuilder()
    .setTitle("Ultimos Erros")
    .setColor(config.menuColor || "#2B6CFF")
    .setDescription(errors.length ? errors.map(error => [
      `<t:${Math.floor(error.createdAt / 1000)}:R> **${error.source}**`,
      `\`${error.message.slice(0, 180)}\``
    ].join("\n")).join("\n\n").slice(0, 3500) : "Nenhum erro registrado.");
}

function sanitizedConfigAttachment(config) {
  const sanitized = JSON.parse(JSON.stringify(config));
  return new AttachmentBuilder(Buffer.from(JSON.stringify(sanitized, null, 2), "utf8"), { name: "nox-guild-config.json" });
}

function isDevCommand(content, prefix) {
  return content === "dev" || content === `${String(prefix || "").toLowerCase()}dev`;
}

function isDevUser(message) {
  const rawIds = process.env.DEV_IDS || process.env.DEV_ID || "";
  const ids = rawIds.split(",").map(id => id.trim()).filter(Boolean);
  if (ids.length) return ids.includes(message.author.id);
  return message.guild.ownerId === message.author.id;
}

function getLastCommitInfo() {
  try {
    const output = execFileSync("git", ["log", "-1", "--pretty=format:%h%n%an%n%ad%n%s", "--date=short"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 3000
    });
    const [hash, author, date, ...messageParts] = output.split(/\r?\n/);
    return {
      hash: hash || "N/A",
      author: author || "N/A",
      date: date || "N/A",
      message: messageParts.join(" ") || "N/A"
    };
  } catch {
    return { hash: "N/A", author: "N/A", date: "N/A", message: "Repositorio git indisponivel." };
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    days ? `${days}d` : null,
    hours ? `${hours}h` : null,
    minutes ? `${minutes}m` : null,
    `${seconds}s`
  ].filter(Boolean).join(" ");
}

async function handleTicketChatInput(message, session) {
  const text = message.content.trim();
  const imageUrls = [
    ...message.attachments.map(attachment => getAttachmentImageUrl(attachment)).filter(Boolean),
    ...parseImageLinks(text)
  ].filter(Boolean).slice(0, 10);
  const imageUrl = imageUrls[0] || null;
  let nextMenu = null;
  let saved = "Configuracao salva.";

  const config = saveGuildConfig(message.guild.id, cfg => {
    const panel = cfg.ticketPanels?.[session.panelId || cfg.ticket.selectedPanelId];
    if (!panel) return;
    const kind = session.kind;
    const key = kind === "internal" ? "internalEmbed" : "panelEmbed";

    if (session.type === "ticket:embedImage") {
      if (!imageUrls.length) return;
      panel[key] = panel[key] || { color: panel.color || "#2B6CFF", items: [] };
      panel[key].items = normalizeTicketEmbedItems(panel[key].items || []);
      const item = panel[key].items.find(entry => entry.id === session.itemId && entry.type === "gallery");
      if (item) item.images = [...imageUrls, ...(item.images || []).filter(url => !imageUrls.includes(url))].slice(0, 10);
      else panel[key].items.push({ id: `item_${Date.now()}`, type: "gallery", images: imageUrls });
      if (kind === "panel") panel.image = imageUrl;
      saved = imageUrls.length > 1 ? `${imageUrls.length} imagens salvas na embed.` : "Imagem salva na embed.";
      return;
    }

    if (session.type === "ticket:panelImage") {
      if (!imageUrl) return;
      const field = session.field === "thumbnailImage" ? "thumbnailImage" : "bannerImage";
      panel[field] = imageUrl;
      if (field === "bannerImage") panel.image = imageUrl;
      saved = field === "bannerImage" ? "Banner salvo no ticket." : "Thumbnail salva no ticket.";
      return;
    }

    if (session.type === "ticket:embedText") {
      const [titleLine = "", ...descriptionLines] = text.split(/\r?\n/);
      const title = resolveGuildEmojiText(message.guild, titleLine.trim());
      const description = resolveGuildEmojiText(message.guild, descriptionLines.join("\n").trim());
      panel[key] = panel[key] || { color: panel.color || "#2B6CFF", items: [] };
      panel[key].items = normalizeTicketEmbedItems(panel[key].items || []);
      if (session.itemId === "new") {
        panel[key].items.push({ id: `item_${Date.now()}`, type: "text", title, description, thumbnail: null });
      } else {
        const item = panel[key].items.find(entry => entry.id === session.itemId);
        if (item) {
          item.title = title || item.title;
          item.description = description || item.description || "";
        }
      }
      if (kind === "panel") {
        if (title) panel.title = title;
        if (description) panel.description = description;
      } else if (description || title) {
        panel.openMessage = description || title;
      }
      return;
    }

    if (session.type === "ticket:embedColor") {
      const color = normalizeColor(text, panel[key]?.color || panel.color || "#2B6CFF");
      panel[key] = panel[key] || { color, items: [] };
      panel[key].color = color;
      if (kind === "panel") panel.color = color;
      return;
    }

    if (session.type === "ticket:buttonField") {
      panel.button = panel.button || {};
      if (session.field === "description") panel.button.description = resolveGuildEmojiText(message.guild, text) || panel.description;
      if (session.field === "emoji") panel.button.emoji = text || null;
      if (session.field === "color") {
        const allowed = ["Primary", "Secondary", "Success", "Danger"];
        panel.button.color = allowed.find(item => item.toLowerCase() === text.toLowerCase()) || "Success";
      }
      return;
    }

    if (session.type === "ticket:selectOption") {
      const [titleLine = "", descriptionLine = "", emojiLine = ""] = text.split(/\r?\n/);
      const title = resolveGuildEmojiText(message.guild, titleLine.trim());
      const description = resolveGuildEmojiText(message.guild, descriptionLine.trim());
      panel.selectOptions = panel.selectOptions || [];
      if (session.mode === "add") {
        const option = {
          id: `option_${Date.now()}`,
          title: title || "Opcao",
          description: description || null,
          emoji: emojiLine.trim() || null,
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
          option.emoji = emojiLine.trim() || null;
        }
      }
      return;
    }

    if (session.type === "ticket:selectEmbed") {
      const [titleLine = "", colorLine = "", ...descriptionLines] = text.split(/\r?\n/);
      const option = panel.selectOptions?.find(item => item.id === panel.selectedSelectOptionId);
      if (option) {
        option.embed = {
          title: resolveGuildEmojiText(message.guild, titleLine.trim()) || option.title,
          color: normalizeColor(colorLine.trim() || panel.color || "#2B6CFF"),
          description: resolveGuildEmojiText(message.guild, descriptionLines.join("\n").trim()) || option.description || ""
        };
      }
    }
  });

  const panel = config.ticketPanels?.[session.panelId || config.ticket.selectedPanelId];
  if (panel) {
    if (session.returnTo === "button") nextMenu = ticketButtonMenu(config, panel.id);
    else if (session.returnTo === "selectOption") nextMenu = ticketSelectOptionMenu(config, panel.selectedSelectOptionId);
    else if (session.returnTo === "manage") nextMenu = ticketManageMenu(config, panel.id);
    else if (session.returnTo === "images") nextMenu = ticketImageMenu(config, panel.id);
    else nextMenu = ticketEmbedConfigMenu(config, session.kind || "panel");
  }

  await message.delete().catch(() => null);
  if (session.messageId && session.channelId && nextMenu) {
    const channel = message.guild.channels.cache.get(session.channelId);
    const origin = await channel?.messages.fetch(session.messageId).catch(() => null);
    if (origin) await origin.edit({ content: null, ...nextMenu }).catch(() => null);
  }
  return message.channel.send({ content: `${message.author}, ${imageUrl || text ? saved : "Nao encontrei nada para salvar."}` })
    .then(reply => setTimeout(() => reply.delete().catch(() => null), 5000))
    .catch(() => null);
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
    .split(/[\s,]+/)
    .map(item => item.trim())
    .filter(item => /^https?:\/\/\S+/i.test(item))
    .slice(0, 10);
}

function getAttachmentImageUrl(attachment) {
  const contentType = attachment.contentType || "";
  const name = attachment.name || "";
  if (contentType && !contentType.startsWith("image/")) return null;
  if (!contentType && !/\.(png|jpe?g|gif|webp)$/i.test(name)) return null;
  return attachment.proxyURL || attachment.url || null;
}

function embedUsage(message, config) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(config.menuColor)
        .setDescription([
          `${message.author}, por favor execute o comando da maneira correta:`,
          `\`${config.prefix}embed <#canal>\` - Criar nova embed`,
          `\`${config.prefix}embed editar <id_da_mensagem>\` - Editar embed existente`
        ].join("\n"))
    ]
  };
}

function parseTextChannel(message, input) {
  const id = input?.match(/^<#(\d+)>$/)?.[1] || input;
  const channel = message.guild.channels.cache.get(id);
  return channel?.isTextBased?.() ? channel : null;
}

function callPanel(guild, config) {
  const call = config.call24h || {};
  const channel = call.channelId ? guild.channels.cache.get(call.channelId) : null;
  const connectedAt = call.connectedAt ? Math.max(0, Math.floor((Date.now() - new Date(call.connectedAt).getTime()) / 1000)) : null;
  const uptime = connectedAt ? formatDuration(connectedAt) : "N/A";

  const embed = new EmbedBuilder()
    .setTitle("Nox Tweaks - Painel de call 24/7")
    .setColor(config.menuColor)
    .setDescription([
      "**Informacoes**",
      `Status: **${call.connected ? "Conectado" : "Desconectado"}**`,
      `Canal: ${channel ? `${channel}` : "`nao configurado`"}`,
      `Ultima Conexao: **${uptime}**`,
      "",
      "**Observacoes**",
      "Apos definir uma call e conectar o bot, ele ficara conectado 24/7."
    ].join("\n"))
    .setThumbnail(guild.client.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: "Nox Tweaks" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("botcall:set").setLabel("Definir Call").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("botcall:connect").setLabel("Conectar").setStyle(ButtonStyle.Success).setDisabled(!call.channelId || call.connected),
    new ButtonBuilder().setCustomId("botcall:disconnect").setLabel("Desconectar").setStyle(ButtonStyle.Primary).setDisabled(!call.connected),
    new ButtonBuilder().setCustomId("botcall:close").setLabel("Fechar Painel").setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

function formatDuration(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days) return `ha ${days} dia${days > 1 ? "s" : ""}`;
  if (hours) return `ha ${hours} hora${hours > 1 ? "s" : ""}`;
  if (minutes) return `ha ${minutes} minuto${minutes > 1 ? "s" : ""}`;
  return "agora";
}

async function findMessageById(guild, messageId) {
  const channels = guild.channels.cache
    .filter(channel => channel.isTextBased?.() && channel.viewable)
    .first(50);

  for (const channel of channels) {
    const found = await channel.messages.fetch(messageId).catch(() => null);
    if (found) return found;
  }

  return null;
}

function parseEmojiInput(input) {
  if (!input) return null;
  const custom = input.match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);
  if (custom) {
    const animated = input.startsWith("<a:");
    return {
      name: custom[1],
      url: `https://cdn.discordapp.com/emojis/${custom[2]}.${animated ? "gif" : "png"}`
    };
  }

  if (/^https?:\/\//i.test(input)) {
    return { name: null, url: input };
  }

  return null;
}

function collectEmojiInputs(message, args) {
  const fromAttachments = message.attachments
    .map(attachment => {
      const url = getAttachmentImageUrl(attachment);
      if (!url) return null;
      return { name: attachment.name?.replace(/\.[^.]+$/, ""), url };
    })
    .filter(Boolean);

  const fromArgs = args
    .map(item => parseEmojiInput(item))
    .filter(Boolean);

  return [...fromAttachments, ...fromArgs];
}

function uniqueEmojiName(guild, value, index = 0) {
  const base = sanitizeEmojiName(value) || `emoji_${index + 1}`;
  let name = base;
  let suffix = 1;
  while (guild.emojis.cache.some(emoji => emoji.name === name)) {
    const extra = String(suffix++);
    name = `${base.slice(0, Math.max(2, 32 - extra.length - 1))}_${extra}`;
  }
  return name;
}

function sanitizeEmojiName(value) {
  const name = String(value || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return name.length >= 2 ? name : null;
}

module.exports = {
  buildDevDiagnostic,
  buildDevErrors,
  buildDevPermissions,
  buildDevTickets,
  callPanel,
  handleMessageCreate,
  sanitizedConfigAttachment
};

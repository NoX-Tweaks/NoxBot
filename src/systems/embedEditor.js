const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const { normalizeColor } = require("../utils/discord");

const embedSessions = new Map();
const uploadSessions = new Map();

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function createEmbedSession(guildId, userId, channelId, messageId, embed) {
  const data = {
    channelId,
    messageId,
    mode: "edit",
    title: embed?.title || "Nox Tweaks",
    description: embed?.description || "Configure esta embed.",
    color: embed?.hexColor || "#2B6CFF",
    image: embed?.image?.url || null,
    thumbnail: embed?.thumbnail?.url || null,
    footer: embed?.footer?.text || null,
    author: embed?.author?.name || null,
    fields: embed?.fields?.map(field => ({ name: field.name, value: field.value, inline: field.inline })) || [],
    buttons: []
  };
  embedSessions.set(sessionKey(guildId, userId), data);
  return data;
}

function createNewEmbedSession(guildId, userId, channelId) {
  const data = {
    channelId,
    messageId: null,
    mode: "create",
    title: "Nox Tweaks",
    description: "Configure esta embed.",
    color: "#2B6CFF",
    image: null,
    thumbnail: null,
    footer: null,
    author: null,
    fields: [],
    buttons: []
  };
  embedSessions.set(sessionKey(guildId, userId), data);
  return data;
}

function getEmbedSession(guildId, userId) {
  return embedSessions.get(sessionKey(guildId, userId));
}

function updateEmbedSession(guildId, userId, updater) {
  const key = sessionKey(guildId, userId);
  const current = embedSessions.get(key);
  if (!current) return null;
  updater(current);
  embedSessions.set(key, current);
  return current;
}

function buildSessionEmbed(session) {
  const embed = new EmbedBuilder()
    .setDescription(renderHeadingDescription(session.title || "Nox Tweaks", session.description || "Configure esta embed."))
    .setColor(normalizeColor(session.color || "#2B6CFF"));
  if (session.image) embed.setImage(session.image);
  if (session.thumbnail) embed.setThumbnail(session.thumbnail);
  if (session.footer) embed.setFooter({ text: session.footer });
  if (session.author) embed.setAuthor({ name: session.author });
  for (const field of (session.fields || []).slice(0, 25)) {
    if (field?.name && field?.value) embed.addFields({ name: field.name, value: field.value, inline: Boolean(field.inline) });
  }
  return embed;
}

function renderHeadingDescription(title, description) {
  return [
    title ? renderHeading(title) : null,
    description || null
  ].filter(Boolean).join("\n");
}

function renderHeading(value) {
  const text = String(value || "").trim();
  return text.startsWith("#") ? text : `# ${text}`;
}

function buildSessionComponents(session) {
  const buttons = (session.buttons || []).slice(0, 5).map(button => {
    const builder = new ButtonBuilder()
      .setLabel(button.label || "Abrir Link")
      .setStyle(ButtonStyle.Link)
      .setURL(button.url);
    return builder;
  });
  return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

function embedEditorMessage(session, ownerId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embededit:edit:${ownerId}`).setLabel("Editar informacoes").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`embededit:update:${ownerId}`).setLabel("Atualizar mensagem").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`embededit:send:${ownerId}`).setLabel("Enviar embed").setStyle(ButtonStyle.Secondary)
  );

  return {
    content: `Editor da mensagem \`${session.messageId}\` em <#${session.channelId}>.`,
    embeds: [buildSessionEmbed(session)],
    components: [row]
  };
}

function embedBuilderPanel(session, ownerId, page = "main") {
  const embed = new EmbedBuilder()
    .setTitle(session.mode === "create" ? "Criador de Embed" : "Editor de Embed")
    .setColor(normalizeColor(session.color || "#2B6CFF"))
    .setDescription([
      `Criando embed para: <#${session.channelId}>`,
      session.messageId ? `Mensagem: \`${session.messageId}\`` : null
    ].filter(Boolean).join("\n"));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`embedbuilder:select:${ownerId}`)
    .setPlaceholder(selectPlaceholder(page));

  for (const option of selectOptions(page)) select.addOptions(option);

  const row = new ActionRowBuilder().addComponents(select);
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embedbuilder:send:${ownerId}`).setLabel(session.mode === "create" ? "Enviar Embed" : "Atualizar Embed").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`embedbuilder:preview:${ownerId}`).setLabel("Visualizar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embedbuilder:cancel:${ownerId}`).setLabel("Cancelar").setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row, actions] };
}

function selectPlaceholder(page) {
  const placeholders = {
    main: "Selecione o que deseja configurar",
    content: "Configurar conteudo da embed",
    images: "Configurar imagens da embed",
    extras: "Configurar extras da embed",
    buttons: "Gerenciar botoes da embed"
  };
  return placeholders[page] || placeholders.main;
}

function selectOptions(page) {
  if (page === "content") {
    return [
      { label: "Definir Titulo", value: "title" },
      { label: "Definir Descricao", value: "description" },
      { label: "Definir Cor", value: "color" },
      { label: "Voltar", value: "back" }
    ];
  }
  if (page === "images") {
    return [
      { label: "Definir Thumbnail", value: "thumbnail" },
      { label: "Definir Imagem Principal", value: "image" },
      { label: "Voltar", value: "back" }
    ];
  }
  if (page === "extras") {
    return [
      { label: "Definir Footer", value: "footer" },
      { label: "Definir Author", value: "author" },
      { label: "Limpar Extras", value: "clearExtras" },
      { label: "Voltar", value: "back" }
    ];
  }
  if (page === "buttons") {
    return [
      { label: "Adicionar Botao", value: "buttonAdd" },
      { label: "Remover Botoes", value: "buttonClear" },
      { label: "Voltar", value: "back" }
    ];
  }
  if (page === "fields") {
    return [
      { label: "Adicionar Field", value: "fieldAdd" },
      { label: "Remover Fields", value: "fieldClear" },
      { label: "Voltar", value: "back" }
    ];
  }
  return [
    { label: "Configurar Embed", description: "Titulo, descricao, cor, etc.", value: "content" },
    { label: "Configurar Imagens", description: "Thumbnail e imagem principal", value: "images" },
    { label: "Configurar Extras", description: "Footer, author, etc.", value: "extras" },
    { label: "Gerenciar Fields", description: "Adicionar ou remover campos", value: "fields" },
    { label: "Gerenciar Botoes", description: "Adicionar, editar ou remover botoes", value: "buttons" },
    { label: "Limpar Embed", description: "Remove imagens, fields e extras", value: "clear" },
    { label: "Enviar Embed", description: "Finalizar e enviar a embed", value: "send" }
  ];
}

function setUploadSession(guildId, userId, type, data = {}) {
  uploadSessions.set(sessionKey(guildId, userId), { type, ...data, createdAt: Date.now() });
}

function takeUploadSession(guildId, userId) {
  const key = sessionKey(guildId, userId);
  const session = uploadSessions.get(key);
  if (session && Date.now() - session.createdAt > 300_000) {
    uploadSessions.delete(key);
    return null;
  }
  uploadSessions.delete(key);
  return session;
}

module.exports = {
  buildSessionEmbed,
  buildSessionComponents,
  createNewEmbedSession,
  createEmbedSession,
  embedBuilderPanel,
  embedEditorMessage,
  getEmbedSession,
  setUploadSession,
  takeUploadSession,
  updateEmbedSession
};

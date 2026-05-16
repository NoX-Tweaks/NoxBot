const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const { normalizeColor } = require("../utils/discord");

function mainMenu(config, requester, botUser) {
  const embed = panelHeader(config, requester, botUser);

  return { embeds: [embed], components: [navigationRow("inicio")] };
}

function panelHeader(config, requester = null, botUser = null) {
  const embed = new EmbedBuilder()
    .setTitle("Central de Configuracoes")
    .setDescription([
      requester ? `Solicitado por: ${requester}` : "Selecione uma opcao abaixo para configurar o bot.",
      requester ? "Selecione uma opcao abaixo para configurar o bot." : null
    ].filter(Boolean).join("\n"))
    .setColor(normalizeColor(config.menuColor))
    .setThumbnail(botUser?.displayAvatarURL?.({ size: 256 }) || null)
    .setFooter({ text: botUser?.username || "Nox Tweaks" })
    .setTimestamp();
  return embed;
}

function serverMenu(config, requester = null, botUser = null) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("server:open")
    .setPlaceholder("Voltar pro Inicio")
    .addOptions(
      { label: "Voltar pro Inicio", value: "inicio" },
      { label: "Pagina Inicial", value: "home" },
      { label: "Bem Vindo", value: "welcome" },
      { label: "Auto Cargo", value: "autorole" },
      { label: "Auto Reacoes", value: "autoreactions" },
      { label: "Reacoes por Usuarios", value: "userreactions" },
      { label: "Auto Mensagem", value: "automessage" }
    );

  return {
    embeds: [panelHeader(config, requester, botUser)],
    components: [
      new ActionRowBuilder().addComponents(select)
    ]
  };
}

function serverSectionMenu(config, section) {
  if (section === "welcome") return welcomeMenu(config);
  if (section === "autorole") return autoRoleMenu(config);
  if (section === "autoreactions") {
    return simpleServerPanel(config, "Painel de Auto Reacoes", config.autoReactions?.enabled, [
      `Reacoes Configuradas: **${config.autoReactions?.items?.length || 0}**`
    ], [
      new ButtonBuilder().setCustomId("server:autoreactionsToggle").setLabel(config.autoReactions?.enabled ? "Desativar" : "Ativar").setStyle(config.autoReactions?.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId("server:autoreactionAdd").setLabel("Adicionar Reacao").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("server:autoreactionList").setLabel("Listar Configuracoes").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("server:autoreactionRemove").setLabel("Remover Reacao").setStyle(ButtonStyle.Danger)
    ]);
  }
  if (section === "userreactions") {
    return simpleServerPanel(config, "Reacoes Personalizadas", config.userReactions?.enabled, [
      `Usuarios Configurados: **${Object.keys(config.userReactions?.users || {}).length}**`,
      `Canais Permitidos: **${config.userReactions?.channels?.length || 0}**`
    ], [
      new ButtonBuilder().setCustomId("server:userreactionsToggle").setLabel(config.userReactions?.enabled ? "Desativar" : "Ativar").setStyle(config.userReactions?.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId("server:userreactionChannels").setLabel("Gerenciar Canais").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("server:userreactionUsers").setLabel("Gerenciar Usuarios").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("server:userreactionList").setLabel("Listar Configuracoes").setStyle(ButtonStyle.Secondary)
    ]);
  }
  if (section === "automessage") {
    return simpleServerPanel(config, "Painel de Auto Mensagem", config.autoMessages?.enabled, [
      `Mensagens Configuradas: **${config.autoMessages?.items?.length || 0}**`,
      "Voce pode configurar ate 10 canais para mensagens automaticas."
    ], [
      new ButtonBuilder().setCustomId("server:automessageToggle").setLabel(config.autoMessages?.enabled ? "Desativar" : "Ativar").setStyle(config.autoMessages?.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId("server:automessageAdd").setLabel("Configurar Mensagens").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("server:automessageList").setLabel("Listar Mensagens").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("server:automessageReset").setLabel("Resetar Configuracoes").setStyle(ButtonStyle.Danger)
    ]);
  }
  return serverMenu(config);
}

function welcomeMenu(config) {
  const w = config.welcome || {};
  const embed = new EmbedBuilder()
    .setTitle("Painel de Bem-Vindo")
    .setColor(normalizeColor(config.menuColor))
    .setDescription([
      "**Informacoes**",
      "Segue a informacao abaixo:",
      "`{member}` - Marca o usuario;",
      "`{username}` - Exibe o nome do usuario;",
      "`{servername}` - Exibe o nome do servidor;",
      "",
      "**Configuracoes**",
      `Mensagem ao Entrar: **${w.enabled ? "Ativado" : "Desativado"}**`,
      `Mensagem apos Registro: **${w.afterRegister ? "Ativado" : "Desativado"}**`,
      `Mensagem na DM: **${w.dmEnabled ? "Ativado" : "Desativado"}**`,
      `Canal: ${w.channelId ? `<#${w.channelId}>` : "`nao configurado`"}`,
      `Tempo de exclusao: **${w.deleteAfter || 30} segundos**`,
      `Modo: **${w.mode || "Normal"}**`,
      `Mensagem: **${w.message ? "Configurado" : "Nao configurado"}**`,
      `Imagem: ${w.image ? `[configurada](${w.image})` : "`nao configurado`"}`
    ].join("\n"));

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("server:back").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("server:welcomeToggle").setLabel(w.enabled ? "Desabilitar" : "Habilitar").setStyle(w.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("server:welcomeChannel").setLabel("Configurar Canal").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("server:welcomeMode").setLabel("Modo Embed").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("server:welcomeTime").setLabel("Configurar Tempo").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("server:welcomeMessage").setLabel("Configurar Mensagem").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("server:welcomeDm").setLabel("Configurar Embed DM").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("server:welcomePreview").setLabel("Preview").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("server:welcomeResetMessage").setLabel("Resetar Mensagem").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("server:welcomeResetChannel").setLabel("Resetar Canal").setStyle(ButtonStyle.Danger)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("server:welcomeImage").setLabel("Imagem").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("server:welcomeClearImage").setLabel("Remover Imagem").setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row1, row2, row3] };
}

function autoRoleMenu(config) {
  const a = config.autoRole;
  const embed = new EmbedBuilder()
    .setTitle("Painel de Auto Cargos")
    .setColor(normalizeColor(config.menuColor))
    .setDescription([
      "**Informacoes**",
      `Status: **${a.enabled ? "Ativado" : "Desativado"}**`,
      `Cargo Membros: ${a.roleId ? `<@&${a.roleId}>` : "`nao configurado`"}`,
      `Cargo Bots: ${a.botRoleId ? `<@&${a.botRoleId}>` : "`nao configurado`"}`,
      `Cargo Boosters: ${a.boosterRoleId ? `<@&${a.boosterRoleId}>` : "`nao configurado`"}`,
      "",
      "**Observacoes**",
      "Cargo de membros sera dado apenas para pessoas ao entrar no servidor.",
      "Cargo de bots sera dado apenas para bots ao entrar no servidor.",
      "Cargo de booster sera dado quando alguem impulsionar seu servidor."
    ].join("\n"));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("server:back").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("server:autoroleToggle").setLabel(a.enabled ? "Desativar" : "Ativar").setStyle(a.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("server:autorole").setLabel("Definir Cargo Membro").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("server:autoroleBot").setLabel("Definir Cargo Bot").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("server:autoroleBooster").setLabel("Definir Cargo Booster").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function simpleServerPanel(config, title, enabled, lines, buttons) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(normalizeColor(config.menuColor))
    .setDescription([
      "**Informacoes**",
      `Status: **${enabled ? "Ativado" : "Desativado"}**`,
      ...lines
    ].join("\n"));
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("server:back").setLabel("Voltar").setStyle(ButtonStyle.Primary),
        ...buttons.slice(0, 4)
      )
    ]
  };
}

function securityMenu(config, requester = null, botUser = null) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("security:open")
    .setPlaceholder("Voltar pro Inicio")
    .addOptions(
      { label: "Voltar pro Inicio", value: "inicio" },
      { label: "Sistema inteiro", value: "enabled" },
      { label: "Anti links", value: "antiLinks" },
      { label: "Anti everyone/here", value: "antiEveryone" },
      { label: "Anti spam", value: "antiSpam" },
      { label: "Anti bot join", value: "antiBotJoin" },
      { label: "Anti deletar canais", value: "antiChannelDelete" },
      { label: "Anti deletar cargos", value: "antiRoleDelete" },
      { label: "Anti ban", value: "antiBan" }
    );

  return { embeds: [panelHeader(config, requester, botUser)], components: [new ActionRowBuilder().addComponents(select)] };
}

function securityOptionMenu(config, key) {
  const labels = {
    enabled: "Sistema inteiro",
    antiLinks: "Anti links",
    antiEveryone: "Anti everyone/here",
    antiSpam: "Anti spam",
    antiBotJoin: "Anti bot join",
    antiChannelDelete: "Anti deletar canais",
    antiRoleDelete: "Anti deletar cargos",
    antiBan: "Anti ban"
  };
  const active = Boolean(config.security[key]);
  const embed = new EmbedBuilder()
    .setTitle(`Seguranca - ${labels[key] || key}`)
    .setColor(active ? 0x28a745 : 0xff4d4f)
    .setDescription([
      `Status: **${active ? "ativado" : "desativado"}**`,
      `Acao: **${config.security.action || "timeout"}**`,
      `Modo observar: **${config.security.observeOnly ? "Sim" : "Nao"}**`,
      `Spam: **${config.security.spamLimit || 6} msg / ${config.security.spamWindowSeconds || 6}s**`,
      "Use os botoes abaixo para modificar esta protecao."
    ].join("\n"));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`security:set:${key}:on`).setLabel("Ativar").setStyle(ButtonStyle.Success).setDisabled(active),
    new ButtonBuilder().setCustomId(`security:set:${key}:off`).setLabel("Desativar").setStyle(ButtonStyle.Danger).setDisabled(!active),
    new ButtonBuilder().setCustomId("security:back").setLabel("Voltar seguranca").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("security:settings").setLabel("Punições/Limites").setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row] };
}

function logMenu(config, requester = null, botUser = null) {
  const channel = key => config.logs[key] ? `<#${config.logs[key]}>` : "`N/A`";
  const embed = panelHeader(config, requester, botUser)
    .setDescription([
      requester ? `Solicitado por: ${requester}` : null,
      requester ? "" : null,
      "**Banimentos e expulsoes**",
      `Banimentos -> ${channel("ban")}`,
      `Desbanimentos -> ${channel("unban")}`,
      `Expulsoes -> ${channel("kick")}`,
      "",
      "**Cargos**",
      `Criar cargos -> ${channel("roleCreate")}`,
      `Deletar cargos -> ${channel("roleDelete")}`,
      `Editar cargos -> ${channel("roleUpdate")}`,
      `Adicionar cargos -> ${channel("roleAdd")}`,
      `Remover cargos -> ${channel("roleRemove")}`,
      "",
      "**Canais**",
      `Criar canais -> ${channel("channelCreate")}`,
      `Deletar canais -> ${channel("channelDelete")}`,
      `Atualizar canais -> ${channel("channelUpdate")}`,
      "",
      "**Membros silenciados**",
      `Silenciados chat -> ${channel("muteText")}`,
      `Silenciados voz -> ${channel("muteVoice")}`,
      "",
      "**Bots adicionados**",
      `Bots adicionados -> ${channel("antiBot")}`,
      "",
      "**Entrada e Saida**",
      `Entrada de membros -> ${channel("memberJoin")}`,
      `Saida de membros -> ${channel("memberLeave")}`,
      "",
      "**Mensagens**",
      `Mensagens apagadas -> ${channel("messageDelete")}`,
      `Mensagens atualizadas -> ${channel("messageUpdate")}`,
      "",
      "**Trafego de voz**",
      `Trafego de voz -> ${channel("voiceTraffic")}`
    ].filter(Boolean).join("\n"));

  const select = new StringSelectMenuBuilder()
    .setCustomId("log:open")
    .setPlaceholder("Voltar pro Inicio")
    .addOptions(
      { label: "Voltar pro Inicio", value: "inicio" },
      { label: "Banimentos", value: "ban" },
      { label: "Cargos", value: "roleCreate" },
      { label: "Canais", value: "channelCreate" },
      { label: "Mensagens", value: "messageDelete" },
      { label: "Trafego de voz", value: "voiceTraffic" },
      { label: "Bots Adicionados", value: "antiBot" },
      { label: "Entrada de Membros", value: "memberJoin" },
      { label: "Saida de Membros", value: "memberLeave" },
      { label: "Membros Silenciados", value: "muteText" }
    );

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("log:setAll").setLabel("Tudo em um canal").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("log:disableAll").setLabel("Desativar todos").setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select), actions] };
}

function ticketMenu(config, requester = null, botUser = null) {
  const panels = config.ticketPanels || {};
  const embed = panelHeader(config, requester, botUser)
    .setDescription([
      requester ? `Solicitado por: ${requester}` : null,
      `Tickets criados: **${Object.keys(panels).length}**`,
      "Selecione uma opcao abaixo para configurar os tickets."
    ].filter(Boolean).join("\n"));

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket:open")
    .setPlaceholder("Voltar pro Inicio")
    .addOptions(
      { label: "Voltar pro Inicio", value: "inicio" },
      { label: "Criar Ticket", value: "create" },
      { label: "Gerenciar Ticket", value: "manage" }
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function ticketManageListMenu(config) {
  const t = config.ticket;
  const panels = config.ticketPanels || {};
  const selectedPanelId = t.selectedPanelId && panels[t.selectedPanelId] ? t.selectedPanelId : Object.keys(panels)[0];
  const selectedPanel = selectedPanelId ? panels[selectedPanelId] : null;
  const embed = new EmbedBuilder()
    .setTitle("Gerenciar Tickets")
    .setColor(normalizeColor(config.menuColor))
    .setDescription([
      `Tickets criados: **${Object.keys(panels).length}**`,
      `Selecionado: **${selectedPanel ? selectedPanel.name : "nenhum"}**`,
      selectedPanel ? `Categoria: ${selectedPanel.categoryId ? `<#${selectedPanel.categoryId}>` : "`nao configurado`"}` : "Crie um ticket para comecar.",
      selectedPanel ? `Canal do painel: ${selectedPanel.panelChannelId ? `<#${selectedPanel.panelChannelId}>` : "`nao configurado`"}` : null,
      selectedPanel ? `Cargos staff: ${formatRoles(selectedPanel)}` : null,
      selectedPanel ? `Log de tickets: ${selectedPanel.logChannelId ? `<#${selectedPanel.logChannelId}>` : "`nao configurado`"}` : null,
      selectedPanel ? `Titulo: **${selectedPanel.title}**` : null,
      selectedPanel ? `Cor: \`${selectedPanel.color || "#2B6CFF"}\`` : null,
      selectedPanel ? `Banner: ${getPanelBanner(selectedPanel) ? `[configurado](${getPanelBanner(selectedPanel)})` : "`nao configurado`"}` : null,
      selectedPanel ? `Thumbnail: ${getPanelThumbnail(selectedPanel) ? `[configurada](${getPanelThumbnail(selectedPanel)})` : "`nao configurado`"}` : null
    ].filter(Boolean).join("\n"));

  const options = Object.entries(panels).slice(0, 25).map(([id, panel]) => ({
    label: panel.name.slice(0, 100),
    value: id,
    description: (panel.title || "Painel de ticket").slice(0, 100),
    default: id === selectedPanelId
  }));

  if (!options.length) {
    options.push({
      label: "Nenhum ticket criado",
      value: "none",
      description: "Use Criar ticket para adicionar um painel.",
      default: true
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket:selectPanel")
    .setPlaceholder("Tickets criados")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:backHome").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:openManage").setLabel("Abrir Gerenciador").setStyle(ButtonStyle.Success).setDisabled(!selectedPanel),
    new ButtonBuilder().setCustomId("ticket:renamePanel").setLabel("Renomear Ticket").setStyle(ButtonStyle.Secondary).setDisabled(!selectedPanel),
    closeEditorButton()
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(select),
      row
    ]
  };
}

function ticketManageMenu(config, panelId) {
  const panels = config.ticketPanels || {};
  const id = panelId && panels[panelId] ? panelId : config.ticket.selectedPanelId;
  const panel = id && panels[id] ? panels[id] : null;

  if (!panel) return ticketManageListMenu(config);

  const embed = new EmbedBuilder()
    .setTitle("Gerenciando um ticket!")
    .setColor(normalizeColor(panel.color || config.menuColor))
    .setDescription([
      "**Informacoes**",
      `Canal Painel: ${panel.panelChannelId ? `<#${panel.panelChannelId}>` : "`N/A`"}`,
      `Canal Logs: ${panel.logChannelId ? `<#${panel.logChannelId}>` : "`N/A`"}`,
      `Categoria: ${panel.categoryId ? `<#${panel.categoryId}>` : "`N/A`"}`,
      `Cargos Responsaveis: ${formatRoles(panel)}`,
      "",
      "**Personalizar**",
      `Usar Topico: **${panel.useTopic ? "Sim" : "Nao"}**`,
      `Usar botao: **${panel.useButton ? "Sim" : "Nao"}**`,
      `Menus de Selecao: **${panel.useSelectMenu ? "Sim" : "Nao"}**`,
      `Limite por usuario: **${panel.ticketLimit === "panel" ? "Por painel" : "Global"}**`,
      `Tickets abertos: **${countOpenTickets(config, id)}**`,
      `Horarios do ticket: **${panel.schedule || "N/A"}**`,
      "",
      "**Observacoes**",
      "Voce pode usar topicos ou canal de texto para o ticket, tambem pode usar um botao ou menu de selecao!"
    ].join("\n"));
  const thumbnail = getPanelThumbnail(panel);
  if (thumbnail) embed.setThumbnail(thumbnail);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:manageList").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:setCategory").setLabel("Setar Categoria").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:setRoles").setLabel("Cargos Responsaveis").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:toggleTopic").setLabel("Usar Topico/Canal").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:toggleButton").setLabel("Usar Botao").setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:toggleSelect").setLabel("Menus de Selecao").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:schedule").setLabel("Horarios").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:setLogs").setLabel("Definir Logs").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:appearance").setLabel("Editar Embed").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:images").setLabel("Imagens").setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:openTickets").setLabel("Tickets Abertos").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:renamePanel").setLabel("Renomear Ticket").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:toggleLimit").setLabel("Limite Usuario").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:deletePanel").setLabel("Deletar Ticket").setStyle(ButtonStyle.Danger),
    closeEditorButton()
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

function ticketEmbedOverviewMenu(config, panelId) {
  const panel = getPanel(config, panelId);
  if (!panel) return ticketManageListMenu(config);
  const embed = new EmbedBuilder()
    .setTitle("Leia atentamente!")
    .setColor(normalizeColor(panel.color || config.menuColor))
    .setDescription([
      "**Embed Painel**",
      "sera a mensagem que ira para o canal onde os usuarios irao interagir para abrir um ticket!",
      "",
      "**Embed Interna**",
      "Sera a mensagem enviada dentro do ticket do usuario apos aberto.",
      "",
      "**OBS:** Voce precisa configurar os dois antes de enviar o painel.",
      "",
      "**O sistema agora usa Components V2** com suporte a galerias, separadores e textos!"
    ].join("\n"))
    .setFooter({ text: panel.name || "Nox Tweaks" });
  const thumbnail = getPanelThumbnail(panel);
  if (thumbnail) embed.setThumbnail(thumbnail);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:openManage").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:embedPanel").setLabel("Embed Painel").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:embedInternal").setLabel("Embed Interna").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:sendPanel").setLabel("Enviar Painel").setStyle(ButtonStyle.Success),
    closeEditorButton()
  );
  return { embeds: [embed], components: [row] };
}

function ticketEmbedConfigMenu(config, kind) {
  const panel = getPanel(config);
  if (!panel) return ticketManageListMenu(config);
  const data = getTicketEmbedData(panel, kind);
  const embed = buildTicketConfigPreview(panel, data, kind, config);

  const addSelect = new StringSelectMenuBuilder()
    .setCustomId(`ticket:embedAdd:${kind}`)
    .setPlaceholder("Adicionar item")
    .addOptions(
      { label: "Texto / Secao", value: "text", description: "Adiciona titulo, descricao e thumbnail opcional" },
      { label: "Galeria (imagens na embed)", value: "gallery", description: "Adiciona ate 10 imagens por upload ou links" },
      { label: "Separador (linha/espaco)", value: "separator", description: "Adiciona separador com linha ou somente espaco" },
      { label: "Remover item selecionado", value: "remove", description: "Remove o item escolhido no menu de editar" },
      { label: "Resetar tudo", value: "reset", description: "Limpa todas as configuracoes da embed" }
    );

  const items = normalizeEmbedItems(data.items || []);
  const editSelect = new StringSelectMenuBuilder()
    .setCustomId(`ticket:embedEdit:${kind}`)
    .setPlaceholder("Editar item")
    .setDisabled(!items.length)
    .addOptions(items.length ? items.slice(0, 25).map((item, index) => ({
      label: `${index + 1}. ${item.type === "separator" ? "Separador" : item.title || item.type || "Item"}`.slice(0, 100),
      value: item.id
    })) : [{ label: "Nenhum item criado", value: "none" }]);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:embedColor:${kind}`).setLabel("Cor").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:embedSave:${kind}`).setLabel("Salvar").setStyle(ButtonStyle.Success),
    closeEditorButton()
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(addSelect),
      new ActionRowBuilder().addComponents(editSelect),
      row
    ]
  };
}

function normalizeEmbedItems(items) {
  return (items || [])
    .filter(item => item && typeof item === "object")
    .map((item, index) => ({
      ...item,
      id: item.id || `legacy_item_${index}`
    }));
}

function getTicketEmbedData(panel, kind) {
  if (kind === "internal") {
    return panel.internalEmbed || { color: panel.color || "#2B6CFF", items: [{ id: "item_default", type: "text", title: "Aguarde um Adm falar com voce.", description: "" }] };
  }
  return panel.panelEmbed || {
    color: panel.color || "#2B6CFF",
    items: [{ id: "item_default", type: "text", title: panel.title || "Titulo do Ticket", description: panel.description || "" }]
  };
}

function buildTicketConfigPreview(panel, data, kind, config) {
  const firstText = (data.items || []).find(item => item.type === "text");
  const embed = new EmbedBuilder()
    .setColor(normalizeColor(data.color || panel.color || config.menuColor))
    .setDescription(renderTicketEmbedItems(data.items || [], kind === "panel" ? panel.description : panel.openMessage));
  const gallery = (data.items || []).find(item => item.type === "gallery");
  const banner = getPanelBanner(panel);
  if (gallery?.images?.[0]) embed.setImage(gallery.images[0]);
  else if (banner && kind === "panel") embed.setImage(banner);
  if (firstText?.thumbnail) embed.setThumbnail(firstText.thumbnail);
  else if (getPanelThumbnail(panel)) embed.setThumbnail(getPanelThumbnail(panel));
  return embed;
}

function renderTicketEmbedItems(items, fallback) {
  if (!items.length) return fallback || "Configure esta embed.";
  return items.map(item => {
    if (item.type === "separator") return renderTicketSeparator(item);
    if (item.type === "gallery") return "";
    return renderTicketTextItem(item);
  }).filter(Boolean).join("\n") || fallback || "Configure esta embed.";
}

function renderTicketTextItem(item) {
  return [
    item.title ? `# ${item.title}` : null,
    item.description || null
  ].filter(Boolean).join("\n");
}

function renderTicketSeparator(item) {
  const spacing = item.size === "grande" ? "\n\n" : "\n";
  return item.line ? `----------------------------------------${spacing}` : spacing;
}

function ticketSelectMenuPanel(config, panelId) {
  const panel = getPanel(config, panelId);
  if (!panel) return ticketManageListMenu(config);

  const options = panel.selectOptions || [];
  const embed = new EmbedBuilder()
    .setTitle(panel.title || "Titulo do Ticket")
    .setDescription([
      panel.description || "Uma descricao boladona sobre o ticket.",
      "O menu de selecao abaixo simula o que ficara no seu ticket apos configurado!",
      "",
      options.length ? "**OBS:** Selecione uma opcao para gerenciar." : "**OBS:** Voce precisa adicionar opcoes ao menu de selecao!"
    ].join("\n"))
    .setColor(normalizeColor(panel.color || config.menuColor))
    .setFooter({ text: panel.name || "Nox Tweaks" });
  const thumbnail = getPanelThumbnail(panel);
  if (thumbnail) embed.setThumbnail(thumbnail);

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket:selectOptionOpen")
    .setPlaceholder("Selecione uma opcao...")
    .setDisabled(!options.length)
    .addOptions(options.length ? options.slice(0, 25).map(option => ({
      label: option.title.slice(0, 100),
      value: option.id,
      description: (option.description || "Sem descricao").slice(0, 100)
    })) : [{ label: "Nenhuma opcao criada", value: "none" }]);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:openManage").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:selectAdd").setLabel("Adicionar Opcoes").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:selectRemove").setLabel("Remover Opcoes").setStyle(ButtonStyle.Secondary).setDisabled(!options.length),
    closeEditorButton()
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select), row] };
}

function ticketSelectOptionMenu(config, optionId) {
  const panel = getPanel(config);
  if (!panel) return ticketManageListMenu(config);
  const option = (panel.selectOptions || []).find(item => item.id === optionId) || panel.selectOptions?.[0];
  if (!option) return ticketSelectMenuPanel(config, panel.id);

  const embed = new EmbedBuilder()
    .setTitle(`Gerenciando menu de selecao - ${option.title}`)
    .setColor(normalizeColor(panel.color || config.menuColor))
    .setDescription([
      "**Informacoes**",
      `Titulo: ${option.title || "N/A"}`,
      `Descricao: ${option.description || "`N/A`"}`,
      `Emoji: ${option.emoji || "`N/A`"}`,
      `Categoria: ${option.categoryId ? `<#${option.categoryId}>` : "`Padrao do painel`"}`,
      `Prefixo canal: **${option.channelPrefix || "ticket"}**`,
      "",
      "**Personalizar**",
      `Cargos Responsaveis: ${formatRoles({ staffRoleIds: option.roleIds || [] })}`,
      `Embed: **${option.embed?.title || "Padrao"}**`,
      "",
      "**Observacoes**",
      "Aqui voce pode personalizar cada menu de selecao, editando a embed interna, cargos responsaveis, etc."
    ].join("\n"));
  const thumbnail = getPanelThumbnail(panel);
  if (thumbnail) embed.setThumbnail(thumbnail);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:toggleSelect").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:selectEdit").setLabel("Editar Menu").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:selectRoles").setLabel("Cargos Responsaveis").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:selectAdvanced").setLabel("Config Avancada").setStyle(ButtonStyle.Secondary),
    closeEditorButton()
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:selectEmbed").setLabel("Embed Interna").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:selectRemoveCurrent").setLabel("Remover Opcao").setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row, row2] };
}

function ticketButtonMenu(config, panelId) {
  const panel = getPanel(config, panelId);
  if (!panel) return ticketManageListMenu(config);
  const button = panel.button || {};
  const embed = new EmbedBuilder()
    .setTitle(panel.title || "Titulo do Ticket")
    .setColor(normalizeColor(panel.color || config.menuColor))
    .setDescription([
      button.description || panel.description || "Uma descricao boladona sobre o ticket.",
      "O botao abaixo simula o botao que ficara no seu ticket apos configurado!",
      "",
      "**OBS: Apos configurar, clique em salvar botao!**"
    ].join("\n"))
    .setFooter({ text: panel.name || "Nox Tweaks" });
  const thumbnail = getPanelThumbnail(panel);
  if (thumbnail) embed.setThumbnail(thumbnail);

  const preview = new ActionRowBuilder().addComponents(
    applyButtonEmoji(new ButtonBuilder()
      .setCustomId("ticket:buttonPreview")
      .setLabel(button.label || "Abrir Ticket")
      .setStyle(buttonStyle(button.color))
      .setDisabled(true), button.emoji)
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:openManage").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:buttonDescription").setLabel("Editar Descricao").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:buttonEmoji").setLabel("Editar Emoji").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:buttonColor").setLabel("Editar Cor").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:buttonSave").setLabel("Salvar Botao").setStyle(ButtonStyle.Success)
  );

  const closeRow = new ActionRowBuilder().addComponents(closeEditorButton());

  return { embeds: [embed], components: [preview, row, closeRow] };
}

function closeEditorButton() {
  return new ButtonBuilder()
    .setCustomId("ticket:closeEditor")
    .setLabel("Apagar Painel")
    .setStyle(ButtonStyle.Danger);
}

function ticketImageMenu(config, panelId) {
  const panel = getPanel(config, panelId);
  if (!panel) return ticketManageListMenu(config);
  const banner = getPanelBanner(panel);
  const thumbnail = getPanelThumbnail(panel);
  const embed = new EmbedBuilder()
    .setTitle("Imagens do Ticket")
    .setColor(normalizeColor(panel.color || config.menuColor))
    .setDescription([
      `Banner: ${banner ? `[configurado](${banner})` : "`nao configurado`"}`,
      `Thumbnail: ${thumbnail ? `[configurada](${thumbnail})` : "`nao configurado`"}`,
      "",
      "Use banner para a imagem grande da embed e thumbnail para a imagem pequena no canto."
    ].join("\n"));
  if (banner) embed.setImage(banner);
  if (thumbnail) embed.setThumbnail(thumbnail);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:imageBanner").setLabel("Definir Banner").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:imageThumbnail").setLabel("Definir Thumbnail").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:imageRemove").setLabel("Remover Imagens").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket:previewPanel").setLabel("Preview").setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:openManage").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    closeEditorButton()
  );
  return { embeds: [embed], components: [row1, row2] };
}

function ticketOpenListMenu(config, panelId) {
  const panel = getPanel(config, panelId);
  if (!panel) return ticketManageListMenu(config);
  const openTickets = Object.entries(config.tickets || {})
    .filter(([, ticket]) => ticket?.open && ticket.panelId === panel.id)
    .slice(0, 20);
  const embed = new EmbedBuilder()
    .setTitle("Tickets Abertos")
    .setColor(normalizeColor(panel.color || config.menuColor))
    .setDescription(openTickets.length ? openTickets.map(([channelId, ticket], index) => [
      `**${index + 1}.** <#${channelId}>`,
      `Dono: <@${ticket.ownerId}>`,
      `Assumido por: ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "`ninguem`"}`,
      `Aberto: <t:${Math.floor((ticket.createdAt || Date.now()) / 1000)}:R>`
    ].join(" | ")).join("\n") : "Nenhum ticket aberto neste painel.");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:openManage").setLabel("Voltar").setStyle(ButtonStyle.Primary),
    closeEditorButton()
  );
  return { embeds: [embed], components: [row] };
}

function getPanelBanner(panel) {
  return panel.bannerImage || panel.image || null;
}

function getPanelThumbnail(panel) {
  return panel.thumbnailImage || null;
}

function countOpenTickets(config, panelId) {
  return Object.values(config.tickets || {}).filter(ticket => ticket?.open && ticket.panelId === panelId).length;
}

function getPanel(config, panelId = null) {
  const panels = config.ticketPanels || {};
  const id = panelId && panels[panelId] ? panelId : config.ticket.selectedPanelId;
  return id && panels[id] ? { id, ...panels[id] } : null;
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

function applyButtonEmoji(button, emoji) {
  const safeEmoji = cleanEmoji(emoji);
  return safeEmoji ? button.setEmoji(safeEmoji) : button;
}

function cleanEmoji(value) {
  const emoji = String(value || "").trim();
  if (!emoji) return null;
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(emoji)) return emoji;
  if (/^\d{17,20}$/.test(emoji)) return emoji;
  if (!/[a-zA-Z0-9_]/.test(emoji) && emoji.length <= 8) return emoji;
  return null;
}

function legacyTicketPanel(config) {
  return {
    id: "default",
    name: "Ticket padrao",
    categoryId: config.ticket.categoryId,
    panelChannelId: config.ticket.panelChannelId,
    staffRoleId: config.ticket.staffRoleId,
    logChannelId: config.ticket.logChannelId,
    title: config.ticket.title,
    description: config.ticket.description,
    color: config.ticket.color,
    image: config.ticket.image,
    bannerImage: config.ticket.bannerImage || config.ticket.image,
    thumbnailImage: config.ticket.thumbnailImage || null,
    openMessage: config.ticket.openMessage
  };
}

function formatRoles(panel) {
  const roles = panel.staffRoleIds?.length ? panel.staffRoleIds : (panel.staffRoleId ? [panel.staffRoleId] : []);
  return roles.length ? roles.map(roleId => `<@&${roleId}>`).join(", ") : "`N/A`";
}

function getSelectedTicketPanel(config) {
  const panels = config.ticketPanels || {};
  const selectedPanelId = config.ticket.selectedPanelId && panels[config.ticket.selectedPanelId]
    ? config.ticket.selectedPanelId
    : Object.keys(panels)[0];

  if (!selectedPanelId) return legacyTicketPanel(config);
  return { id: selectedPanelId, ...panels[selectedPanelId] };
}

function ticketPanelMenu(config) {
  const panel = getSelectedTicketPanel(config);
  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(panel.description)
    .setColor(normalizeColor(panel.color));
  const banner = getPanelBanner(panel);
  const thumbnail = getPanelThumbnail(panel);
  if (banner) embed.setImage(banner);
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

function oldTicketMenu(config) {
  const t = config.ticket;
  const embed = new EmbedBuilder()
    .setTitle("Ticket")
    .setColor(0x2b6cff)
    .setDescription([
      `Categoria: ${t.categoryId ? `<#${t.categoryId}>` : "`nao configurado`"}`,
      `Canal do painel: ${t.panelChannelId ? `<#${t.panelChannelId}>` : "`nao configurado`"}`,
      `Cargo staff: ${t.staffRoleId ? `<@&${t.staffRoleId}>` : "`nao configurado`"}`,
      `Log de tickets: ${t.logChannelId ? `<#${t.logChannelId}>` : "`nao configurado`"}`,
      `Titulo: **${t.title}**`,
      `Cor: \`${t.color || "#2B6CFF"}\``,
      `Imagem/GIF: ${t.image ? `[configurada](${t.image})` : "`nao configurado`"}`
    ].join("\n"));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:config").setLabel("Canais/Cargos").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:appearance").setLabel("Aparencia").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:sendPanel").setLabel("Enviar painel").setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

function embedMenu(config, requester = null, botUser = null) {
  const embed = panelHeader(config, requester, botUser);
  const select = new StringSelectMenuBuilder()
    .setCustomId("embed:open")
    .setPlaceholder("Voltar pro Inicio")
    .addOptions(
      { label: "Voltar pro Inicio", value: "inicio" },
      { label: "Editar embed", value: "config" },
      { label: "Enviar neste canal", value: "send" },
      { label: "Editor avancado", value: "builder" },
      { label: "Salvar template", value: "saveTemplate" },
      { label: "Carregar template", value: "loadTemplate" },
      { label: "Limpar embed", value: "clear" }
    );
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function customizeMenu(config, requester = null, botUser = null) {
  const embed = panelHeader(config, requester, botUser)
    .setDescription([
      requester ? `Solicitado por: ${requester}` : null,
      "**Informacoes do Bot**",
      `Prefix: \`${config.prefix}\``,
      `Idioma: \`${config.language || "pt-br"}\``,
      `Cor Embed: \`${config.menuColor || "#2B6CFF"}\``
    ].filter(Boolean).join("\n"));

  const select = new StringSelectMenuBuilder()
    .setCustomId("custom:open")
    .setPlaceholder("Voltar pro Inicio")
    .addOptions(
      { label: "Voltar pro Inicio", value: "inicio" },
      { label: "Alterar Idioma", value: "language" },
      { label: "Alterar Prefixo", value: "prefix" },
      { label: "Alterar Cor Embed", value: "defaultEmbed" },
      { label: "Alterar Nickname", value: "nickname" },
      { label: "Alterar Avatar", value: "iconFile" },
      { label: "Alterar Banner", value: "bannerFile" }
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function navigationRow(current = "inicio") {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("menu:navigate")
      .setPlaceholder("Voltar pro Inicio")
      .addOptions(
        { label: "Voltar pro Inicio", value: "inicio", default: current === "inicio" },
        { label: "Personalizar", value: "personalizar", default: current === "personalizar" },
        { label: "Servidor", value: "servidor", default: current === "servidor" },
        { label: "Seguranca", value: "seguranca", default: current === "seguranca" },
        { label: "Ticket", value: "ticket", default: current === "ticket" },
        { label: "Embed", value: "embed", default: current === "embed" },
        { label: "Log", value: "log", default: current === "log" }
      )
  );
}

function buildCustomEmbed(config) {
  const data = config.embed;
  const embed = new EmbedBuilder()
    .setTitle(data.title || "Nox Tweaks")
    .setDescription(data.description || "Configure esta embed pelo menu.")
    .setColor(normalizeColor(data.color))
    .setTimestamp();
  if (data.footer) embed.setFooter({ text: data.footer });
  if (data.author) embed.setAuthor({ name: data.author });
  if (data.image) embed.setImage(data.image);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  for (const field of (data.fields || []).slice(0, 25)) {
    if (field?.name && field?.value) embed.addFields({ name: field.name, value: field.value, inline: Boolean(field.inline) });
  }
  return embed;
}

module.exports = {
  buildCustomEmbed,
  customizeMenu,
  embedMenu,
  getSelectedTicketPanel,
  logMenu,
  mainMenu,
  securityMenu,
  securityOptionMenu,
  serverSectionMenu,
  serverMenu,
  ticketManageListMenu,
  ticketManageMenu,
  ticketImageMenu,
  ticketOpenListMenu,
  ticketButtonMenu,
  ticketEmbedConfigMenu,
  ticketEmbedOverviewMenu,
  ticketPanelMenu,
  ticketSelectMenuPanel,
  ticketSelectOptionMenu,
  ticketMenu
};

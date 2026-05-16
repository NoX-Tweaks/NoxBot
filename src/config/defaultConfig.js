const DEFAULT_PREFIX = "nt!";

function defaultGuildConfig() {
  return {
    prefix: DEFAULT_PREFIX,
    language: "pt-br",
    menuColor: "#2B6CFF",
    menuUsers: [],
    logs: {
      basic: null,
      joinLeave: null,
      voice: null,
      messages: null,
      ticket: null,
      security: null,
      ban: null,
      unban: null,
      kick: null,
      roleCreate: null,
      roleDelete: null,
      roleUpdate: null,
      roleAdd: null,
      roleRemove: null,
      channelCreate: null,
      channelDelete: null,
      channelUpdate: null,
      muteText: null,
      muteVoice: null,
      antiBot: null,
      memberJoin: null,
      memberLeave: null,
      messageDelete: null,
      messageUpdate: null,
      voiceTraffic: null
    },
    autoRole: {
      enabled: false,
      roleId: null,
      botRoleId: null,
      boosterRoleId: null,
      includeBots: false
    },
    welcome: {
      enabled: false,
      afterRegister: false,
      dmEnabled: false,
      channelId: null,
      deleteAfter: 30,
      mode: "Normal",
      message: "Bem-vindo {member} ao {servername}!",
      image: null
    },
    autoReactions: {
      enabled: false,
      items: []
    },
    userReactions: {
      enabled: false,
      users: {},
      channels: []
    },
    autoMessages: {
      enabled: false,
      items: [],
      selectedItemId: null
    },
    call24h: {
      channelId: null,
      connected: false,
      connectedAt: null
    },
    security: {
      enabled: false,
      antiLinks: false,
      antiEveryone: false,
      antiSpam: false,
      antiBotJoin: false,
      antiChannelDelete: false,
      antiRoleDelete: false,
      antiBan: false,
      action: "timeout",
      spamLimit: 6,
      spamWindowSeconds: 6,
      timeoutSeconds: 60,
      observeOnly: false
    },
    ticket: {
      categoryId: null,
      panelChannelId: null,
      staffRoleId: null,
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
      panelEmbed: {
        color: "#2B6CFF",
        items: []
      },
      internalEmbed: {
        color: "#2B6CFF",
        items: [
          { id: "item_default", type: "text", title: "Aguarde um Adm falar com voce.", description: "" }
        ]
      },
      schedule: null,
      counter: 0,
      selectedPanelId: null
    },
    ticketPanels: {},
    embed: {
      title: "Nox Tweaks",
      description: "Configure esta embed pelo menu.",
      color: "#2B6CFF",
      image: null,
      thumbnail: null,
      footer: "Nox Tweaks",
      author: null,
      fields: [],
      templates: {}
    },
    tickets: {}
  };
}

module.exports = {
  DEFAULT_PREFIX,
  defaultGuildConfig
};

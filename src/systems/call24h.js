const {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus
} = require("@discordjs/voice");
const { PermissionsBitField } = require("discord.js");
const { getGuildConfig, saveGuildConfig } = require("../database/guildStore");

const reconnectTimers = new Map();

function getConfiguredVoiceChannel(guild, config = getGuildConfig(guild.id)) {
  const channelId = config.call24h?.channelId;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  return channel?.isVoiceBased?.() ? channel : null;
}

function canJoinVoiceChannel(guild, channel) {
  const permissions = channel?.permissionsFor(guild.members.me);
  return Boolean(permissions?.has(PermissionsBitField.Flags.Connect));
}

async function connectCall24h(guild, options = {}) {
  const config = getGuildConfig(guild.id);
  const channel = getConfiguredVoiceChannel(guild, config);
  if (!channel) return { ok: false, reason: "Defina uma call valida antes de conectar." };
  if (!canJoinVoiceChannel(guild, channel)) return { ok: false, reason: "Nao tenho permissao para conectar nessa call." };

  clearReconnect(guild.id);
  const existing = getVoiceConnection(guild.id);
  if (existing?.joinConfig?.channelId === channel.id && existing.state.status !== VoiceConnectionStatus.Destroyed) {
    attachReconnectHandler(guild, existing);
    return { ok: true, channel, connection: existing };
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  attachReconnectHandler(guild, connection);
  if (options.waitForReady !== false) {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000).catch(() => null);
  }

  return { ok: true, channel, connection };
}

function disconnectCall24h(guildId) {
  clearReconnect(guildId);
  const connection = getVoiceConnection(guildId);
  if (connection) connection.destroy();
}

function attachReconnectHandler(guild, connection) {
  if (connection.__noxReconnectAttached) return;
  connection.__noxReconnectAttached = true;

  connection.on("stateChange", (_, newState) => {
    if (newState.status === VoiceConnectionStatus.Disconnected) {
      scheduleReconnect(guild, 5_000);
    }
    if (newState.status === VoiceConnectionStatus.Destroyed) {
      scheduleReconnect(guild, 5_000);
    }
  });
}

function scheduleReconnect(guild, delayMs = 10_000) {
  const config = getGuildConfig(guild.id);
  if (!config.call24h?.connected || !config.call24h?.channelId) return;
  if (reconnectTimers.has(guild.id)) return;

  const timer = setTimeout(async () => {
    reconnectTimers.delete(guild.id);
    const freshConfig = getGuildConfig(guild.id);
    if (!freshConfig.call24h?.connected || !freshConfig.call24h?.channelId) return;

    const result = await connectCall24h(guild, { waitForReady: false }).catch(() => ({ ok: false }));
    if (!result.ok) scheduleReconnect(guild, 30_000);
  }, delayMs);

  reconnectTimers.set(guild.id, timer);
}

function clearReconnect(guildId) {
  const timer = reconnectTimers.get(guildId);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(guildId);
}

function startCall24hAutoReconnect(client) {
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      const config = getGuildConfig(guild.id);
      if (!config.call24h?.connected || !config.call24h?.channelId) continue;
      const connection = getVoiceConnection(guild.id);
      const currentChannelId = connection?.joinConfig?.channelId;
      if (connection && currentChannelId === config.call24h.channelId && connection.state.status !== VoiceConnectionStatus.Destroyed) {
        attachReconnectHandler(guild, connection);
        continue;
      }
      scheduleReconnect(guild, 1_000);
    }
  }, 30_000);

  for (const guild of client.guilds.cache.values()) {
    const config = getGuildConfig(guild.id);
    if (config.call24h?.connected && config.call24h?.channelId) scheduleReconnect(guild, 3_000);
  }
}

function markCall24hConnected(guildId) {
  return saveGuildConfig(guildId, cfg => {
    cfg.call24h.connected = true;
    cfg.call24h.connectedAt = cfg.call24h.connectedAt || new Date().toISOString();
  });
}

function markCall24hDisconnected(guildId) {
  return saveGuildConfig(guildId, cfg => {
    cfg.call24h.connected = false;
    cfg.call24h.connectedAt = null;
  });
}

module.exports = {
  connectCall24h,
  disconnectCall24h,
  getConfiguredVoiceChannel,
  markCall24hConnected,
  markCall24hDisconnected,
  startCall24hAutoReconnect
};

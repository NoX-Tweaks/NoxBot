const { ActivityType } = require("discord.js");

const STREAM_URL = "https://www.twitch.tv/noxtweaks";

function updateBotPresence(client, prefix = "x") {
  if (!client?.user) return;
  client.user.setPresence({
    activities: [{
      name: `Prefixo: ${prefix}`,
      type: ActivityType.Streaming,
      url: STREAM_URL
    }],
    status: "online"
  });
}

module.exports = {
  updateBotPresence
};

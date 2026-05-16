require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials
} = require("discord.js");
const { registerEvents } = require("./src/events/registerEvents");
const { initDatabase } = require("./src/database/guildStore");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

registerEvents(client);

process.on("unhandledRejection", error => console.error(error));
process.on("uncaughtException", error => console.error(error));

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    console.error("Defina DISCORD_TOKEN no .env ou nas variaveis da SquareCloud.");
    process.exit(1);
  }

  await initDatabase();
  await client.login(process.env.DISCORD_TOKEN);
}

main();

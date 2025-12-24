import { Client, GatewayIntentBits } from "discord.js";
import express from "express";

// ===== Discord Bot =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);

// ===== Web Server (Koyeb用) =====
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(3000, () => console.log("Web server started"));
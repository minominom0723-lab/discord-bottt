import { Client, GatewayIntentBits } from "discord.js";
import express from "express";

// ===== Discord Bot =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayINtentBits.GuildMembers,
  ],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});
// ===== 新規参加者チェック =====
client.on("guildMemberAdd", async (member) => {
  // 通知したいチャンネルID
  const ALERT_CHANNEL_ID = "1335258197669183590";

  const channel = member.guild.channels.cache.get(ALERT_CHANNEL_ID);
  if (!channel) return;

  const now = Date.now();
  const createdAt = member.user.createdTimestamp;
  const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) {
    channel.send(
      `⚠️ **新規参加者アラート**\n` +
      `ユーザー: ${member.user.tag}\n` +
      `アカウント作成: <t:${Math.floor(createdAt / 1000)}:R>`
    );
  }
});

client.login(process.env.TOKEN);

// ===== Web Server (Koyeb用) =====
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000, () => console.log("Web server started"));
import * as Discord from "discord.js";
import express from "express";

const { Client, GatewayIntentBits } = Discord;

// ====== 設定（RenderのEnvironment Variablesで入れるの推奨） ======
const TOKEN = process.env.TOKEN; // Discord Bot Token
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID || "1335258197669183590"; // 監視通知先（あなたのIDでOK）
const MENTION_LIMIT = Number(process.env.MENTION_LIMIT || 5); // 1メッセで@がこれ以上ならアウト
const SPAM_COUNT = Number(process.env.SPAM_COUNT || 6);       // この回数
const SPAM_WINDOW_SEC = Number(process.env.SPAM_WINDOW_SEC || 8); // この秒数以内に連投したらアウト
const TIMEOUT_MIN = Number(process.env.TIMEOUT_MIN || 60 * 24);   // タイムアウト時間（分）= 24h

// ====== Discord Client ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ====== 簡易スパム検知用メモリ（再起動するとリセット） ======
const recentMsgs = new Map(); // userId -> [timestamp, timestamp, ...]

function pushTimestamp(userId) {
  const now = Date.now();
  const arr = recentMsgs.get(userId) || [];
  arr.push(now);

  // window外は捨てる
  const windowMs = SPAM_WINDOW_SEC * 1000;
  while (arr.length && now - arr[0] > windowMs) arr.shift();

  recentMsgs.set(userId, arr);
  return arr.length;
}

async function getAlertChannel(guild) {
  try {
    const ch = await guild.channels.fetch(ALERT_CHANNEL_ID);
    return ch ?? null;
  } catch {
    return null;
  }
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ====== ② 新規参加者チェック（アカウント作成7日以内で通知） ======
client.on("guildMemberAdd", async (member) => {
  const channel = await getAlertChannel(member.guild);
  if (!channel) return;

  const now = Date.now();
  const createdAt = member.user.createdTimestamp;
  const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) {
    await channel.send(
      `⚠️ **新規参加者アラート**\n` +
      `ユーザー: ${member.user.tag}\n` +
      `アカウント作成: <t:${Math.floor(createdAt / 1000)}:R>\n` +
      `参加: <t:${Math.floor(now / 1000)}:R>`
    );
  }
});

// ====== ① スパム/メンション連投 → 24hタイムアウト＋通知 ======
client.on("messageCreate", async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;

  // メンション多すぎ
  const mentionCount =
    (message.mentions.users?.size || 0) +
    (message.mentions.roles?.size || 0);

  // 連投
  const countInWindow = pushTimestamp(message.author.id);

  const isMentionSpam = mentionCount >= MENTION_LIMIT;
  const isFlood = countInWindow >= SPAM_COUNT;

  if (!isMentionSpam && !isFlood) return;

  // 権限チェック（botに「タイムアウト」権限が必要）
  const me = message.guild.members.me;
  if (!me?.permissions.has(Discord.PermissionsBitField.Flags.ModerateMembers)) {
    console.log("Missing permission: ModerateMembers");
    return;
  }

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  const channel = await getAlertChannel(message.guild);

  // タイムアウト実行
  const ms = TIMEOUT_MIN * 60 * 1000;
  await member.timeout(ms, isMentionSpam ? "Mention spam" : "Message spam").catch(() => null);

  // 通知
  if (channel) {
    await channel.send(
      `🛑 **AutoMod処理（Bot側）**\n` +
      `対象: ${message.author.tag} (${message.author.id})\n` +
      `理由: ${isMentionSpam ? `メンション過多(${mentionCount})` : `連投(${countInWindow}/${SPAM_WINDOW_SEC}s)`}\n` +
      `処置: ${TIMEOUT_MIN}分タイムアウト\n` +
      `場所: <#${message.channelId}>`
    );
  }
});

client.login(TOKEN);

// ====== Render用：Webサーバ（落ちないようにするだけ） ======
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000, () => console.log("Web server started"));

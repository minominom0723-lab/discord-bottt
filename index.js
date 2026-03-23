import * as Discord from "discord.js";
import express from "express";

const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = Discord;

// ====== 設定（RenderのEnvironment Variablesで入れるの推奨） ======
const TOKEN = process.env.TOKEN; // Discord Bot Token
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID || "1335258197669183590";

const MENTION_LIMIT = Number(process.env.MENTION_LIMIT || 3); // 3秒で3回以上メンション
const SPAM_COUNT = Number(process.env.SPAM_COUNT || 3);       // 3秒で3回以上メッセージ
const SPAM_WINDOW_SEC = Number(process.env.SPAM_WINDOW_SEC || 3); // 判定時間3秒
const TIMEOUT_MIN = Number(process.env.TIMEOUT_MIN || 60 * 24);   // 1日

const EXEMPT_USER_IDS = [
  "1103132552979554346", // おやつ
  "756362386453168171",  // りつ
  "952851392639410208",  // みのむし
  "1119797155402633328", // だいふく
  "914417538396467201"   // みやゆめ
];

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
const mentionHistory = new Map(); // userId -> [timestamp, timestamp, ...]

function pushMentionTimestamp(userId, mentionCount) {
  const now = Date.now();
  const arr = mentionHistory.get(userId) || [];

  if (mentionCount > 0) {
    arr.push(now);
  }

  const windowMs = SPAM_WINDOW_SEC * 1000;
  while (arr.length && now - arr[0] > windowMs) {
    arr.shift();
  }

  mentionHistory.set(userId, arr);
  return arr.length;
}
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
  if (EXEMPT_USER_IDS.includes(message.author.id)) return;

  if (message.mentions.everyone) {
    const me = message.guild.members.me;

    if (!me?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      console.log("Missing permission: ModerateMembers");
      return;
    }

    const member = await message.guild.members
      .fetch(message.author.id)
      .catch(() => null);
    if (!member) return;

    const ms = TIMEOUT_MIN * 60 * 1000;

    await member
      .timeout(ms, "Everyone/Here mention")
      .catch(() => null);

    const embed = new EmbedBuilder()
      .setColor(0xE53935)
      .setTitle("⚠ 異常なメンションを検知")
      .setDescription(
        `<@${message.author.id}>\n異常なメンションを検知したため **1日間タイムアウト** されました。`
      )
      .addFields(
        { name: "処置", value: "24時間タイムアウト", inline: true }
      )
      .setTimestamp();

    await message.channel
      .send({ embeds: [embed] })
      .catch(() => null);

    return;
  }

  // ===== メンション数 =====
  const mentionCount =
  (message.mentions.users?.size || 0) +
  (message.mentions.roles?.size || 0) +
  (message.mentions.everyone ? 1 : 0); 
  // @everyone/@here 対策

  // ===== 連投 =====
  const countInWindow = pushTimestamp(message.author.id);

  const isMentionSpam = mentionCount >= MENTION_LIMIT;
  const isFlood = countInWindow >= SPAM_COUNT;

  if (!isMentionSpam && !isFlood) return;

  // ===== 権限チェック =====
  const me = message.guild.members.me;
  if (!me?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    console.log("Missing permission: ModerateMembers");
    return;
  }

  const member = await message.guild.members
    .fetch(message.author.id)
    .catch(() => null);
  if (!member) return;

  // ===== タイムアウト =====
  const ms = TIMEOUT_MIN * 60 * 1000;
  await member
    .timeout(ms, isMentionSpam ? "Mention spam" : "Message spam")
    .catch(() => null);

  // ===== 通知（※ ここに embed を書く）=====
  const embed = new EmbedBuilder()
    .setColor(isMentionSpam ? 0xE53935 : 0xFBC02D)
    .setTitle(
      isMentionSpam
        ? "⚠ 異常なメンションを検知"
        : "⚠ スパムを検知"
    )
    .setDescription(
      `<@${message.author.id}>\n` +
      (isMentionSpam
        ? "異常なメンションを検知したため **1日間タイムアウト** されました。"
        : "スパムを検知したため **1日間タイムアウト** されました。")
    )
    .addFields(
      { name: "処置", value: "24時間タイムアウト", inline: true }
    )
    .setTimestamp();

  await message.channel
    .send({ embeds: [embed] })
    .catch(() => null);
});

client.login(TOKEN);

// ====== Render用：Webサーバ（落ちないようにするだけ） ======
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000, () => console.log("Web server started"));






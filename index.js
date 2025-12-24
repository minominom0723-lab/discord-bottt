const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require("discord.js");

// ★ここだけ自分のBOTトークンにする（" " で囲む）


// ===== 設定 =====
const TIMEOUT_MS = 24 * 60 * 60 * 1000; // 1日
const WINDOW_MS = 8000; // 判定窓（8秒）
const SPAM_LIMIT = 6; // 8秒で6投稿以上 → スパム
const MENTION_LIMIT = 2; // 8秒で @everyone/@here を合計2回以上 → メンション過多
const COOLDOWN_MS = 60 * 1000; // 1分は再処罰しない（連続発動防止）

// 色（Embed）
const COLOR_MENTION = 0xffc107; // 黄
const COLOR_SPAM = 0xff3b30; // 赤

// ===== メモリ（簡易）=====
const msgTimes = new Map(); // userId -> [timestamps]
const mentionTimes = new Map(); // userId -> [timestamps]
const lastAction = new Map(); // userId -> lastActionTimestamp

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function withinCooldown(userId) {
  const last = lastAction.get(userId) || 0;
  return Date.now() - last < COOLDOWN_MS;
}

function pushAndTrim(map, userId, now, addCount = 1) {
  const arr = map.get(userId) || [];
  for (let i = 0; i < addCount; i++) arr.push(now);

  const cutoff = now - WINDOW_MS;
  while (arr.length && arr[0] < cutoff) arr.shift();

  map.set(userId, arr);
  return arr.length;
}

function countEveryoneHere(msgContent) {
  let count = 0;
  if (msgContent.includes("@everyone")) count++;
  if (msgContent.includes("@here")) count++;
  return count;
}

async function timeoutMember(member, reasonText) {
  if (!member.moderatable) {
    throw new Error("このメンバーをタイムアウトできません（Botの権限/ロール順序を確認）");
  }
  await member.timeout(TIMEOUT_MS, reasonText);
}

client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    const member = message.member;
    if (!member) return;

    const me = message.guild.members.me;
    if (!me?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

    const now = Date.now();
    const userId = message.author.id;

    if (withinCooldown(userId)) return;

    // ===== メンション（@everyone/@here のみ）=====
    const m = countEveryoneHere(message.content);
    if (m > 0) {
      const mCount = pushAndTrim(mentionTimes, userId, now, m);

      if (mCount >= MENTION_LIMIT) {
        const embed = new EmbedBuilder()
          .setTitle("⚠️ タイムアウト（過度なメンション）")
          .setDescription(
            `${message.author}\n\n` +
              `⚠️過度なメンションにより1日間タイムアウトされました。\n` +
              `異議申し立てならびに問い合わせは管理者に行ってください。\n\n` +
              `Timed out for 1 day due to excessive mentions. Please contact an administrator for appeals and inquiries.`
          )
          .setColor(COLOR_MENTION)
          .setTimestamp();

        await timeoutMember(member, "Timed out for 1 day due to excessive mentions (@everyone/@here).");
        lastAction.set(userId, now);

        await message.channel.send({ content: `${message.author}`, embeds: [embed] });
        return;
      }
    }

    // ===== スパム（短時間連投）=====
    const spamCount = pushAndTrim(msgTimes, userId, now, 1);

    if (spamCount >= SPAM_LIMIT) {
      const embed = new EmbedBuilder()
        .setTitle("⚠️ タイムアウト（スパム検知）")
        .setDescription(
          `${message.author}\n\n` +
            `⚠️スパムを検知したため1日間タイムアウトされました。\n` +
            `問い合わせは管理者に行ってください。\n\n` +
            `Spam has been detected and your account has been timed out for one day. Please contact your administrator for inquiries.`
        )
        .setColor(COLOR_SPAM)
        .setTimestamp();

      await timeoutMember(member, "Timed out for 1 day due to spam detection.");
      lastAction.set(userId, now);

      await message.channel.send({ content: `${message.author}`, embeds: [embed] });
      return;
    }
  } catch (err) {
    console.log("Error:", err?.message || err);
  }
});

client.once("ready", () => {
  console.log(`ログイン成功: ${client.user.tag}`);
});

client.login(process.env.TOKEN)
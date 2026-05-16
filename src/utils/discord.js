function normalizeColor(value, fallback = "#2B6CFF") {
  const fallbackColor = /^#?[0-9a-f]{6}$/i.test(String(fallback || "").trim())
    ? String(fallback).trim().replace(/^#?/, "#")
    : "#2B6CFF";
  const raw = String(value || "").trim();
  if (!raw) return fallbackColor;

  const color = raw.replace(/^#?/, "#");
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map(char => char + char).join("")}`.toUpperCase();
  }

  return fallbackColor;
}

function safeChannel(guild, id) {
  return id ? guild.channels.cache.get(id) : null;
}

function yesNo(value) {
  return ["sim", "s", "yes", "y", "on", "true", "1"].includes(String(value).trim().toLowerCase());
}

function resolveGuildEmojiText(guild, value) {
  if (!guild || !value) return value;
  return String(value).replace(/:([a-zA-Z0-9_]{2,32}):/g, (match, name, offset, text) => {
    if (text[offset - 1] === "<" || text.slice(Math.max(0, offset - 2), offset) === "<a") return match;
    const emoji = guild.emojis.cache.find(item => item.name === name);
    if (!emoji) return match;
    return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
  });
}

module.exports = {
  normalizeColor,
  safeChannel,
  resolveGuildEmojiText,
  yesNo
};

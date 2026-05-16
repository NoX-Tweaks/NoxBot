const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { DEFAULT_PREFIX, defaultGuildConfig } = require("../config/defaultConfig");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const CERTS_DIR = path.join(__dirname, "..", "..", "certs");
const DEFAULT_CA_FILE = path.join(CERTS_DIR, "ca-certificate.crt");
const DEFAULT_CERT_FILE = path.join(CERTS_DIR, "certificate.pem");
const DEFAULT_KEY_FILE = path.join(CERTS_DIR, "private-key.key");
const DATABASE_NAME = "nox_bot";
const COLLECTION_NAME = "guilds";
const BOT_SCOPE = resolveBotScope();
const DB_PATH = path.join(DATA_DIR, `guilds-${BOT_SCOPE}.json`);

let cache = {};
let mongoClient = null;
let mongoCollection = null;
let mongoOnline = false;
let reconnectTimer = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
}

function readDb() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeDb(db) {
  ensureDataDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function resolveBotScope() {
  const tokenBotId = parseBotIdFromToken(process.env.DISCORD_TOKEN);
  return sanitizeStorageId(tokenBotId || "default");
}

function parseBotIdFromToken(token) {
  const firstPart = String(token || "").split(".")[0];
  if (!firstPart) return null;

  try {
    const normalized = firstPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return /^\d{17,20}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function sanitizeStorageId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "default";
}

function storageKey(guildId) {
  return `${BOT_SCOPE}:${guildId}`;
}

function unscopedGuildId(key) {
  const prefix = `${BOT_SCOPE}:`;
  return String(key).startsWith(prefix) ? String(key).slice(prefix.length) : String(key);
}

function mergeDefaults(base, saved) {
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(saved || {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = mergeDefaults(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function migrateGuildConfig(config) {
  if (config?.prefix === "x") {
    config.prefix = DEFAULT_PREFIX;
  }
  return config;
}

function buildMongoOptions() {
  const options = {
    serverSelectionTimeoutMS: 8000
  };
  const caFile = DEFAULT_CA_FILE;
  const certFile = DEFAULT_CERT_FILE;
  const keyFile = DEFAULT_KEY_FILE;

  if (fs.existsSync(caFile) || fs.existsSync(certFile) || fs.existsSync(keyFile)) {
    options.tls = true;
  }

  if (fs.existsSync(caFile)) {
    options.ca = fs.readFileSync(path.resolve(caFile));
    options.tls = true;
  }

  if (fs.existsSync(certFile)) {
    options.cert = fs.readFileSync(path.resolve(certFile));
    options.tls = true;
  }

  if (fs.existsSync(keyFile)) {
    options.key = fs.readFileSync(path.resolve(keyFile));
    options.tls = true;
  }

  return options;
}

async function initDatabase() {
  cache = readDb();

  if (!process.env.MONGO_URI) {
    console.log("MONGO_URI nao definido. Usando JSON local como banco.");
    return;
  }

  await connectMongo();

  if (!reconnectTimer) {
    reconnectTimer = setInterval(() => {
      if (!mongoOnline) connectMongo().catch(() => null);
    }, 30_000);
  }
}

async function connectMongo() {
  try {
    if (mongoClient) await mongoClient.close().catch(() => null);
    mongoClient = new MongoClient(process.env.MONGO_URI, buildMongoOptions());
    await mongoClient.connect();
    const db = mongoClient.db(DATABASE_NAME);
    mongoCollection = db.collection(COLLECTION_NAME);

    const docs = await mongoCollection.find({ botId: BOT_SCOPE }).toArray();
    const mongoData = {};
    for (const doc of docs) {
      mongoData[doc._id] = migrateGuildConfig(mergeDefaults(defaultGuildConfig(), doc.config || {}));
    }

    cache = mergeDefaults(cache, mongoData);
    writeDb(cache);
    await syncCacheToMongo();
    mongoOnline = true;
    console.log(`MongoDB conectado para bot ${BOT_SCOPE}. JSON local ficou como fallback.`);
  } catch (error) {
    mongoOnline = false;
    console.error("Nao foi possivel conectar ao MongoDB. Usando JSON local como fallback.", error.message);
  }
}

async function syncCacheToMongo() {
  if (!mongoCollection) return;

  const operations = Object.entries(cache).map(([guildId, config]) => ({
    updateOne: {
      filter: { _id: guildId },
      update: { $set: { botId: BOT_SCOPE, guildId: unscopedGuildId(guildId), config, updatedAt: new Date() } },
      upsert: true
    }
  }));

  if (operations.length) await mongoCollection.bulkWrite(operations);
}

async function persistGuildToMongo(guildId, config) {
  if (!mongoOnline || !mongoCollection) return;

  try {
    await mongoCollection.updateOne(
      { _id: guildId },
      { $set: { botId: BOT_SCOPE, guildId: unscopedGuildId(guildId), config, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    mongoOnline = false;
    console.error("MongoDB caiu. Salvando apenas no JSON local ate reiniciar/reconectar.", error.message);
  }
}

async function getDatabaseStatus() {
  if (!process.env.MONGO_URI) {
    return { online: true, type: "JSON local", pingMs: 0 };
  }

  if (!mongoOnline || !mongoClient) {
    return { online: false, type: "MongoDB", pingMs: null };
  }

  const startedAt = Date.now();
  try {
    await mongoClient.db(DATABASE_NAME).admin().ping();
    return { online: true, type: "MongoDB", pingMs: Date.now() - startedAt };
  } catch (error) {
    mongoOnline = false;
    return { online: false, type: "MongoDB", pingMs: null, error: error.message };
  }
}

function getGuildConfig(guildId) {
  const key = storageKey(guildId);
  if (!cache[key]) {
    cache[key] = defaultGuildConfig();
    writeDb(cache);
    persistGuildToMongo(key, cache[key]);
  } else {
    const merged = migrateGuildConfig(mergeDefaults(defaultGuildConfig(), cache[key]));
    if (JSON.stringify(merged) !== JSON.stringify(cache[key])) {
      cache[key] = merged;
      writeDb(cache);
      persistGuildToMongo(key, cache[key]);
    }
  }
  return cache[key];
}

function saveGuildConfig(guildId, updater) {
  const key = storageKey(guildId);
  cache[key] = migrateGuildConfig(mergeDefaults(defaultGuildConfig(), cache[key]));
  updater(cache[key]);
  writeDb(cache);
  persistGuildToMongo(key, cache[key]);
  return cache[key];
}

module.exports = {
  initDatabase,
  getDatabaseStatus,
  getGuildConfig,
  saveGuildConfig
};

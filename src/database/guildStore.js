const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { defaultGuildConfig } = require("../config/defaultConfig");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "guilds.json");
const CERTS_DIR = path.join(__dirname, "..", "..", "certs");
const DEFAULT_CA_FILE = path.join(CERTS_DIR, "ca-certificate.crt");
const DEFAULT_CERT_FILE = path.join(CERTS_DIR, "certificate.pem");
const DEFAULT_KEY_FILE = path.join(CERTS_DIR, "private-key.key");
const COLLECTION_NAME = "guilds";

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

function buildMongoOptions() {
  const options = {
    serverSelectionTimeoutMS: 8000
  };
  const caFile = process.env.MONGO_CA_FILE || DEFAULT_CA_FILE;
  const certFile = process.env.MONGO_CERT_FILE || DEFAULT_CERT_FILE;
  const keyFile = process.env.MONGO_KEY_FILE || DEFAULT_KEY_FILE;

  if (process.env.MONGO_TLS === "true" || fs.existsSync(caFile) || fs.existsSync(certFile) || fs.existsSync(keyFile)) {
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

  if (process.env.MONGO_TLS_ALLOW_INVALID_CERTIFICATES === "true") {
    options.tls = true;
    options.tlsAllowInvalidCertificates = true;
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
    const db = mongoClient.db(process.env.MONGO_DB_NAME || "nox_bot");
    mongoCollection = db.collection(COLLECTION_NAME);

    const docs = await mongoCollection.find({}).toArray();
    const mongoData = {};
    for (const doc of docs) {
      mongoData[doc._id] = mergeDefaults(defaultGuildConfig(), doc.config || {});
    }

    cache = mergeDefaults(cache, mongoData);
    writeDb(cache);
    await syncCacheToMongo();
    mongoOnline = true;
    console.log("MongoDB conectado. JSON local ficou como fallback.");
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
      update: { $set: { config, updatedAt: new Date() } },
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
      { $set: { config, updatedAt: new Date() } },
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
    await mongoClient.db(process.env.MONGO_DB_NAME || "nox_bot").admin().ping();
    return { online: true, type: "MongoDB", pingMs: Date.now() - startedAt };
  } catch (error) {
    mongoOnline = false;
    return { online: false, type: "MongoDB", pingMs: null, error: error.message };
  }
}

function getGuildConfig(guildId) {
  if (!cache[guildId]) {
    cache[guildId] = defaultGuildConfig();
    writeDb(cache);
    persistGuildToMongo(guildId, cache[guildId]);
  } else {
    const merged = mergeDefaults(defaultGuildConfig(), cache[guildId]);
    if (JSON.stringify(merged) !== JSON.stringify(cache[guildId])) {
      cache[guildId] = merged;
      writeDb(cache);
      persistGuildToMongo(guildId, cache[guildId]);
    }
  }
  return cache[guildId];
}

function saveGuildConfig(guildId, updater) {
  cache[guildId] = mergeDefaults(defaultGuildConfig(), cache[guildId]);
  updater(cache[guildId]);
  writeDb(cache);
  persistGuildToMongo(guildId, cache[guildId]);
  return cache[guildId];
}

module.exports = {
  initDatabase,
  getDatabaseStatus,
  getGuildConfig,
  saveGuildConfig
};

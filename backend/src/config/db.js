import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { Resolver } from "dns/promises";

dotenv.config();

const dbHost = process.env.DB_HOST || "";
const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

async function resolveDbHost(host) {
  if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;

  try {
    const addresses = await resolver.resolve4(host);
    return addresses[0] || host;
  } catch (error) {
    console.warn("[db] DNS fallback failed:", error.message);
    return host;
  }
}

const resolvedDbHost = await resolveDbHost(dbHost);
const shouldUseSsl = process.env.DB_SSL === "true";

const ssl =
  shouldUseSsl
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
        servername: dbHost,
      }
    : undefined;

const pool = mysql.createPool({
  host: resolvedDbHost,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  maxIdle: Number(process.env.DB_MAX_IDLE || 5),
  idleTimeout: Number(process.env.DB_IDLE_TIMEOUT || 60000),
  queueLimit: 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 30000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  ssl,
});

const transientConnectionCodes = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
  "ETIMEDOUT",
  "EPIPE",
]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rawQuery = pool.query.bind(pool);
const rawExecute = pool.execute.bind(pool);

async function retryTransient(operation) {
  const maxAttempts = Number(process.env.DB_QUERY_RETRY_ATTEMPTS || 6);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      const canRetry =
        transientConnectionCodes.has(err.code) && attempt < maxAttempts;

      if (!canRetry) {
        throw err;
      }

      await wait(400 * attempt);
    }
  }

  return undefined;
}

pool.query = (...args) => retryTransient(() => rawQuery(...args));
pool.execute = (...args) => retryTransient(() => rawExecute(...args));

export default pool;

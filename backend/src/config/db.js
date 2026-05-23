import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const dbHost = process.env.DB_HOST || "";
const shouldUseSsl = process.env.DB_SSL === "true";

const ssl =
  shouldUseSsl
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
      }
    : undefined;

const pool = mysql.createPool({
  host: dbHost,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  ssl,
});

const transientConnectionCodes = new Set([
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
  "ETIMEDOUT",
  "EPIPE",
]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rawQuery = pool.query.bind(pool);
const rawExecute = pool.execute.bind(pool);

async function retryTransient(operation) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      const canRetry =
        transientConnectionCodes.has(err.code) && attempt < maxAttempts;

      if (!canRetry) {
        throw err;
      }

      await wait(150 * attempt);
    }
  }

  return undefined;
}

pool.query = (...args) => retryTransient(() => rawQuery(...args));
pool.execute = (...args) => retryTransient(() => rawExecute(...args));

export default pool;

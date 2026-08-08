import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * One pool per process. Next dev reloads modules, so cache it on globalThis to
 * avoid exhausting connections. Swapping local Postgres for Neon serverless is
 * a `DATABASE_URL` change only — the `pg` driver speaks to both.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url;
}

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: connectionString(),
    // Neon and other hosted providers require TLS; local Docker does not.
    ssl: process.env.DATABASE_URL?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };

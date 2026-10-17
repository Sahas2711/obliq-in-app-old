import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof connect>;

function connect(url: string) {
  // `prepare: false` keeps queries working behind transaction poolers
  // such as Neon's or Supabase's pooled connection strings.
  return drizzle(postgres(url, { prepare: false, max: 5 }), { schema });
}

// Reuse one pool per server process, including across dev hot reloads.
const cache = globalThis as unknown as { obliqDb?: Database };

// Connect on first use so `next build` works without DATABASE_URL.
export function getDb() {
  if (cache.obliqDb) return cache.obliqDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  cache.obliqDb = connect(url);
  return cache.obliqDb;
}

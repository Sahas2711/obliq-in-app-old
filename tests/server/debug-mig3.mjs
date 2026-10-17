import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { readFileSync } from "node:fs";
const PG = {
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "password",
};
const admin = postgres(
  `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/postgres`,
  { max: 1 },
);
try {
  await admin`CREATE DATABASE obliq_debug_3`;
} finally {
  await admin.end();
}
const db = drizzle(
  postgres(
    `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/obliq_debug_3`,
    { prepare: false, max: 1 },
  ),
  { schema: undefined },
);
const sql = readFileSync("drizzle/0000_init.sql", "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);
for (let i = 0; i < statements.length; i++) {
  try {
    await db.execute(statements[i]);
  } catch (e) {
    console.log(
      `stmt ${i} FAILED: ${e.message} | pos: ${e.position} | start: ${statements[i].slice(0, 100)}`,
    );
    process.exitCode = 1;
    break;
  }
}
console.log("ALL OK");

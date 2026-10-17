import postgres from "postgres";
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
  await admin`CREATE DATABASE obliq_debug_1`;
} finally {
  await admin.end();
}
const db = postgres(
  `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/obliq_debug_1`,
  { prepare: false, max: 1 },
);
import { readFileSync } from "node:fs";
const sql = readFileSync("drizzle/0000_init.sql", "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);
console.log("num statements:", statements.length);
for (let i = 0; i < statements.length; i++) {
  try {
    await db.execute(statements[i]);
    console.log(`stmt ${i} OK: ${statements[i].slice(0, 50)}...`);
  } catch (e) {
    console.log(
      `stmt ${i} FAILED: ${e.message} | start: ${statements[i].slice(0, 80)}`,
    );
    process.exitCode = 1;
    break;
  }
}
await db.end();

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// Resolve the generated Drizzle schema the same way the server code does
// (`import "../src/server/db/schema"` through the route). We use the real
// schema object so queries and migrations match the backend exactly.
import * as schema from "../../../src/server/db/schema.ts";

// Local authorized development Postgres (17 on 5432). The CI workflow runs a
// disposable Postgres service instead, so the same helpers work there too.
const PG = {
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "password",
};

function connect(url: string) {
  // `prepare: false` keeps queries working behind transaction poolers.
  return drizzle(postgres(url, { prepare: false, max: 5 }), { schema });
}

export type Db = ReturnType<typeof connect>;

export async function createTestDatabase(): Promise<{ db: Db; url: string }> {
  const name = `obliq_test_${randomUUID().slice(0, 8)}`;
  const admin = postgres(
    `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/postgres`,
    { max: 1 },
  );
  try {
    await admin.unsafe(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${name}`;
  const db = connect(url);
  await runMigrations(db);
  return { db, url };
}

async function runMigrations(db: Db) {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  // Resolve the drizzle migration source from the project root. We run these
  // tests from the repository root, so process.cwd() is reliable here.
  const root = process.cwd();
  const sql = readFileSync(join(root, "drizzle/0000_init.sql"), "utf8");
  for (const stmt of sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await db.execute(stmt);
  }
}

export async function dropTestDatabase(name: string) {
  const admin = postgres(
    `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/postgres`,
    { max: 1 },
  );
  try {
    await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);
  } catch {
    // Best-effort cleanup; do not fail the suite on cleanup errors.
  } finally {
    await admin.end();
  }
}

export async function createTestUser(
  db: Db,
  email: string,
  name: string,
): Promise<{ id: string; firmId: string; name: string }> {
  const [user] = await db
    .insert(schema.users)
    .values({ email, name })
    .returning({ id: schema.users.id });
  const userId = user.id;
  const firmId = randomUUID();
  await db
    .insert(schema.firms)
    .values({ id: firmId, name: `Firm ${name}`, createdBy: userId });
  await db.insert(schema.firmMembers).values({ firmId, userId, role: "owner" });
  await db.insert(schema.userIdentities).values({
    provider: "dev",
    providerUserId: `dev|${userId}`,
    userId,
  });
  return { id: userId, firmId, name };
}

export async function seedDemoFirm(db: Db): Promise<string> {
  const [demoUser] = await db
    .insert(schema.users)
    .values({ email: "demo@firm.com", name: "Demo Demo" })
    .returning({ id: schema.users.id });
  const firmId = randomUUID();
  await db
    .insert(schema.firms)
    .values({ id: firmId, name: "Demo Firm", createdBy: demoUser.id });
  await db
    .insert(schema.firmMembers)
    .values({ firmId, userId: demoUser.id, role: "owner" });
  await db.insert(schema.userIdentities).values({
    provider: "dev",
    providerUserId: `dev|${demoUser.id}`,
    userId: demoUser.id,
  });
  return firmId;
}

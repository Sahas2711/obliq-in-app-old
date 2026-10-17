import { createTestDatabase } from "./helpers/db.ts";
// Set DATABASE_URL before any getDb call
const { db: isoDb, url: isoDbUrl } = await createTestDatabase();
process.env.DATABASE_URL = isoDbUrl;

const a = await (
  await import("./helpers/db.ts")
).createTestUser(isoDb, "firm-a@obliq.dev", "Firm A");
console.log("a.firmId =", a.firmId, "a.id =", a.id);

function makeSession(firm) {
  return {
    userId: firm.id,
    name: firm.name,
    firmId: firm.firmId,
    role: "owner",
  };
}
const sessionA = makeSession(a);

const { clients, firms } = await import("../../src/server/db/schema.ts");
const rows = await isoDb.select().from(firms);
console.log("firms in isoDb:", JSON.stringify(rows));

// Mimic createRecord's tx.insert(clients).values({ firmId, name, contact, email })
const { eq } = await import("drizzle-orm");
const res = await isoDb
  .insert(clients)
  .values({
    firmId: sessionA.firmId,
    name: "Alpha Client",
    contact: "A1",
    email: "a1@alpha.dev",
  })
  .returning();
console.log("direct insert OK:", JSON.stringify(res));

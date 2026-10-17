import { createTestDatabase } from "./helpers/db.ts";
const db = await createTestDatabase();
const a = await (
  await import("./helpers/db.ts")
).createTestUser(db, "firm-a@obliq.dev", "Firm A");
console.log("user.id =", a.id);
console.log("user.firmId =", a.firmId);
const { createTestUser } = await import("./helpers/db.ts");
const { clients, firms } = await import("../../src/server/db/schema.ts");
const q = await db.select().from(firms);
console.log("firms rows:", JSON.stringify(q, null, 2));
// try insert client with firmId
const { eq } = await import("drizzle-orm");
const clientRes = await db
  .insert(clients)
  .values({
    firmId: a.firmId,
    name: "Alpha",
    contact: "A1",
    email: "a1@alpha.dev",
  })
  .returning();
console.log("client insert OK:", JSON.stringify(clientRes));

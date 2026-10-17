import { createTestDatabase } from "./helpers/db.ts";
const db = await createTestDatabase();
const a = await (
  await import("./helpers/db.ts")
).createTestUser(db, "firm-a@obliq.dev", "Firm A");
function makeSession(firm) {
  return {
    userId: firm.id,
    name: firm.name,
    firmId: firm.firmId,
    role: "owner",
  };
}
const sessionA = makeSession(a);
console.log("sessionA.firmId =", sessionA.firmId);
console.log("a.firmId =", a.firmId);
console.log("a.id =", a.id);
// insert client the same way createRecord does
const { eq } = await import("drizzle-orm");
const { clients } = await import("../../src/server/db/schema.ts");
const { getDb } = await import("../../src/server/db/client.ts");
const d = getDb();
const res = await d
  .insert(clients)
  .values({
    firmId: sessionA.firmId,
    name: "Alpha Client",
    contact: "A1",
    email: "a1@alpha.dev",
  })
  .returning();
console.log("client insert OK:", JSON.stringify(res));

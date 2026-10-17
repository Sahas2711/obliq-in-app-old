import { createTestDatabase } from "./helpers/db.ts";
const db = await createTestDatabase();
console.log("created db, inserting user...");
const { createTestUser } = await import("./helpers/db.ts");
const a = await createTestUser(db, "firm-a@obliq.dev", "Firm A");
console.log("user:", a.id);
try {
  // Simulate loadWorkspace's first query
  const { eq } = await import("drizzle-orm");
  const { clients } = await import("../../../src/server/db/schema.ts");
  const { getDb } = await import("../../../src/server/db/client.ts");
  const d = getDb();
  const rows = await d
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.firmId, a.firmId));
  console.log("query ok:", rows);
} catch (e) {
  console.log("query FAILED:", e.message);
  console.log(e.stack);
}

import { createTestDatabase } from "./helpers/db.ts";
const { db: isoDb, url: isoDbUrl } = await createTestDatabase();
process.env.DATABASE_URL = isoDbUrl;

const a = await (
  await import("./helpers/db.ts")
).createTestUser(isoDb, "firm-a@obliq.dev", "Firm A");
function makeSession(firm) {
  return {
    userId: firm.id,
    name: firm.name,
    firmId: firm.firmId,
    role: "owner",
  };
}
const sessionA = makeSession(a);

// Load the backend service via loader-interception (server-only shim)
const { createRecord } = await import("../../src/server/workspace/service.ts");

try {
  const result = await createRecord(sessionA, {
    kind: "client",
    values: { title: "Alpha Client", contact: "A1", email: "a1@alpha.dev" },
  });
  console.log("createRecord OK:", JSON.stringify(result));
} catch (e) {
  console.log("createRecord FAILED:", e.message);
  console.log(e.stack);
}

import { createTestDatabase } from "./helpers/db.ts";
const { db: isoDb, url: isoDbUrl } = await createTestDatabase();
process.env.DATABASE_URL = isoDbUrl;
const a = await (
  await import("./helpers/db.ts")
).createTestUser(isoDb, "firm-a@obliq.dev", "Firm A");
const b = await (
  await import("./helpers/db.ts")
).createTestUser(isoDb, "firm-b@obliq.dev", "Firm B");
const { makeSession } = await import("./helpers/db.ts");
// duplicate makeSession
function makeSession(firm) {
  return {
    userId: firm.id,
    name: firm.name,
    firmId: firm.firmId,
    role: "owner",
  };
}
const sessionA = makeSession(a);
const { createRecord } = await import("../../src/server/workspace/service.ts");
await createRecord(sessionA, {
  kind: "client",
  values: { title: "Alpha Client", contact: "A1", email: "a1@alpha.dev" },
});
await createRecord(sessionB, {
  kind: "client",
  values: { title: "Beta Client", contact: "B1", email: "b1@beta.dev" },
});
await createRecord(sessionA, {
  kind: "project",
  values: { title: "Alpha Project", client: "Alpha Client", due: "2026-12-01" },
});
const { db: isoDb2, url: isoDbUrl2 } = await createTestDatabase();

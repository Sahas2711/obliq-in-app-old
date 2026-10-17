import { createTestDatabase } from "./helpers/db.ts";
const { db: isoDb, url: isoDbUrl } = await createTestDatabase();
process.env.DATABASE_URL = isoDbUrl;
const a = await (
  await import("./helpers/db.ts")
).createTestUser(isoDb, "firm-a@obliq.dev", "Firm A");
const b = await (
  await import("./helpers/db.ts")
).createTestUser(isoDb, "firm-b@obliq.dev", "Firm B");
function makeSession(firm) {
  return {
    userId: firm.id,
    name: firm.name,
    firmId: firm.firmId,
    role: "owner",
  };
}
const sessionA = makeSession(a);
// create firm B's client first (via backend)
const { createRecord, loadWorkspace } =
  await import("../../src/server/workspace/service.ts");
await createRecord(makeSession(b), {
  kind: "client",
  values: { title: "Beta Client", contact: "B1", email: "b1@beta.dev" },
});
// now try creating firm A's project with client "Beta Client"
try {
  const r = await createRecord(sessionA, {
    kind: "project",
    values: {
      title: "Alpha Project",
      client: "Beta Client",
      due: "2026-12-01",
    },
  });
  console.log("NO REJECTION: got result", JSON.stringify(r).slice(0, 200));
} catch (e) {
  console.log("REJECTED:", e.message);
}

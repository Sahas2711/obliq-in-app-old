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
const sessionB = makeSession(b);

// aClient, bClient
await (
  await import("../../src/server/workspace/service.ts")
).createRecord(sessionA, {
  kind: "client",
  values: { title: "Alpha Client", contact: "A1", email: "a1@alpha.dev" },
});
await (
  await import("../../src/server/workspace/service.ts")
).createRecord(sessionB, {
  kind: "client",
  values: { title: "Beta Client", contact: "B1", email: "b1@beta.dev" },
});

// aProject, bProject
await (
  await import("../../src/server/workspace/service.ts")
).createRecord(sessionA, {
  kind: "project",
  values: { title: "Alpha Project", client: "Alpha Client", due: "2026-12-01" },
});
await (
  await import("../../src/server/workspace/service.ts")
).createRecord(sessionB, {
  kind: "project",
  values: { title: "Beta Project", client: "Beta Client", due: "2026-12-01" },
});

// NOW the failing call
const svc = await import("../../src/server/workspace/service.ts");
try {
  const r = await svc.createRecord(sessionA, {
    kind: "project",
    values: { title: "Bad Project", client: "Beta Client", due: "2026-12-01" },
  });
  console.log("NO REJECTION: got result", JSON.stringify(r).slice(0, 150));
} catch (e) {
  console.log("REJECTED:", e.message);
}

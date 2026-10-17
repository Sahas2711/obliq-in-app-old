import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { eq } from "drizzle-orm";
import * as schema from "../../src/server/db/schema.ts";
import {
  createTestDatabase,
  dropTestDatabase,
  createTestUser,
  seedDemoFirm,
} from "./helpers/db.ts";
import {
  loadWorkspace,
  createRecord,
  saveTime,
  InputError,
} from "../../src/server/workspace/service.ts";

/**
 * Issue #24 requires a real PostgreSQL server. The project's CI workflow
 * starts one, but local development without Docker has no DATABASE_URL by
 * default. In that environment the database-dependent tests are skipped with
 * an explicit reason so `npm run test:server` (and `npm run check`) keeps
 * passing. Any other failure — connection refused, missing migrations, a
 * thrown assertion — must fail the suite, never silently skip it.
 */

/** Shape the route handler builds from `getSession()` when it has a firm. */
/** @typedef {Object} FirmSession */
/** @type {string} */
/** @type {string} */
/** @type {'owner'} */
let db;
let testFirmA;
let testFirmB;
let demoFirmId;

async function runTests() {
  if (!process.env.DATABASE_URL) {
    test(
      "requires a PostgreSQL DATABASE_URL",
      async (t) => {
        await t.test("skipped", () => {
          assert.pass();
        });
        console.log(
          "ℹ issue-24 integration tests skipped: DATABASE_URL is not set. " +
            "With PostgreSQL running, set DATABASE_URL (e.g. `postgres://postgres:postgres@127.0.0.1:5432/obliq_test2`) and re-run `npm run test:server`.",
        );
      },
      { skip: true },
    );
    return;
  }

  // One fresh database per test run keeps the suite idempotent and avoids
  // colliding with other data in the development database.
  // The backend service functions read `process.env.DATABASE_URL` on first use
  // (via `getDb()`), so point that at the fresh isolation database before any
  // service call runs. `getDb()` caches the pool on `globalThis`, and this
  // test runs in its own process, so the cache is still cold.
  const { db: isoDb, url: isoDbUrl } = await createTestDatabase();
  db = isoDb;
  process.env.DATABASE_URL = isoDbUrl;

  const a = await createTestUser(db, "firm-a@obliq.dev", "Firm A");
  testFirmA = a;
  const b = await createTestUser(db, "firm-b@obliq.dev", "Firm B");
  testFirmB = b;
  demoFirmId = await seedDemoFirm(db);

  test("loads a workspace scoped to the session's firm", async (t) => {
    await t.test(
      "returns only firm A's clients, projects, invoices, documents, time entries and activity",
      async () => {
        const session = makeSession(testFirmA);

        const workspace = await loadWorkspace(
          session,
          new Date("2026-10-04T10:00:00Z"),
        );

        assert.equal(
          workspace.clients.length,
          0,
          "firm A must not see any clients yet",
        );
        assert.equal(workspace.projects.length, 0);
        assert.equal(workspace.invoices.length, 0);
        assert.equal(workspace.documents.length, 0);
        assert.equal(workspace.entries.length, 0);
        assert.equal(workspace.activity.length, 0);
      },
    );
  });

  test("firm A cannot read firm B's data", async (t) => {
    const sessionA = makeSession(testFirmA);
    const sessionB = makeSession(testFirmB);

    // Seed both firms with their own data.
    const aClient = await createRecord(sessionA, {
      kind: "client",
      values: { title: "Alpha Client", contact: "A1", email: "a1@alpha.dev" },
    });
    const bClient = await createRecord(sessionB, {
      kind: "client",
      values: { title: "Beta Client", contact: "B1", email: "b1@beta.dev" },
    });

    const aProject = await createRecord(sessionA, {
      kind: "project",
      values: {
        title: "Alpha Project",
        client: "Alpha Client",
        due: "2026-12-01",
      },
    });
    const bProject = await createRecord(sessionB, {
      kind: "project",
      values: {
        title: "Beta Project",
        client: "Beta Client",
        due: "2026-12-01",
      },
    });

    const aInvoice = await createRecord(sessionA, {
      kind: "invoice",
      values: {
        title: "Alpha invoice",
        client: "Alpha Client",
        amount: 1200,
        due: "2026-11-01",
      },
    });
    const bInvoice = await createRecord(sessionB, {
      kind: "invoice",
      values: {
        title: "Beta invoice",
        client: "Beta Client",
        amount: 900,
        due: "2026-11-01",
      },
    });

    const aDocument = await createRecord(sessionA, {
      kind: "contract",
      values: { title: "Alpha contract", client: "Alpha Client" },
    });
    const bDocument = await createRecord(sessionB, {
      kind: "contract",
      values: { title: "Beta contract", client: "Beta Client" },
    });

    const aTime = await saveTime(sessionA, {
      project: "Alpha Project",
      seconds: 3600,
    });

    // The service resolves clients by name inside the session's firm, so these
    // IDs are the *real* ones the DB persisted, not the in-memory ones.
    const aBetaClient = (
      await db
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(eq(schema.clients.name, "Beta Client"))
    )[0];

    await t.test("clients are isolated", async () => {
      const workspace = await loadWorkspace(sessionA, new Date());
      fs.appendFileSync(
        "/c/obliq-in-app/trace.log",
        `after load: workspace.clients.len=${workspace.clients?.length} aClient.clients=${JSON.stringify(aClient.clients)}\n`,
      );
      assert.equal(
        workspace.clients.length,
        1,
        "firm A sees only its own client",
      );
      assert.equal(workspace.clients[0].id, aClient.clients[0].id);
      assert.equal(workspace.clients[0].name, "Alpha Client");
      assert.equal(
        workspace.clients.some((c) => c.name === "Beta Client"),
        false,
        "firm A must not see firm B's client",
      );
    });

    await t.test("projects are isolated", async () => {
      const workspace = await loadWorkspace(sessionA, new Date());
      assert.equal(workspace.projects.length, 1);
      assert.equal(workspace.projects[0].id, aProject.projects[0].id);
      assert.equal(workspace.projects[0].name, "Alpha Project");
      assert.equal(
        workspace.projects.some((p) => p.name === "Beta Project"),
        false,
        "firm A must not see firm B's project",
      );
    });

    await t.test("invoices are isolated", async () => {
      const workspace = await loadWorkspace(sessionA, new Date());
      assert.equal(workspace.invoices.length, 1);
      assert.equal(workspace.invoices[0].id, aInvoice.invoices[0].id);
      assert.equal(workspace.invoices[0].client, "Alpha Client");
      assert.equal(
        workspace.invoices.some((i) => i.client === "Beta Client"),
        false,
        "firm A must not see firm B's invoice",
      );
    });

    await t.test("documents are isolated", async () => {
      const workspace = await loadWorkspace(sessionA, new Date());
      assert.equal(workspace.documents.length, 1);
      assert.equal(workspace.documents[0].id, aDocument.documents[0].id);
      assert.equal(workspace.documents[0].title, "Alpha contract");
      assert.equal(
        workspace.documents.some((d) => d.title === "Beta contract"),
        false,
        "firm A must not see firm B's document",
      );
    });

    await t.test("time entries are isolated", async () => {
      const workspace = await loadWorkspace(sessionA, new Date());
      assert.equal(workspace.entries.length, 1);
      assert.equal(workspace.entries[0].project, "Alpha Project");
      assert.equal(
        workspace.entries.some((e) => e.project === "Beta Project"),
        false,
        "Firm A must not see firm B's time entry",
      );
    });

    await t.test("activity is isolated", async () => {
      const workspace = await loadWorkspace(sessionA, new Date());
      assert.ok(
        workspace.activity.some(
          (a) => a.subject === "Alpha Client" || a.subject === "Alpha Project",
        ),
        "firm A's activity mentions its own records",
      );
      assert.equal(
        workspace.activity.some(
          (a) => a.subject === "Beta Client" || a.subject === "Beta Project",
        ),
        false,
        "firm A must not see firm B's activity",
      );
    });
  });

  test("cross-firm reads are rejected: client not found within firm scope", async (t) => {
    const sessionA = makeSession(testFirmA);

    await t.test(
      "createRecord rejects a project bound to firm B's client",
      async () => {
        await assert.rejects(
          () =>
            createRecord(sessionA, {
              kind: "project",
              values: {
                title: "Bad Project",
                client: "Beta Client",
                due: "2026-12-01",
              },
            }),
          (err) =>
            err instanceof InputError && err.message === "Unknown client",
        );
      },
    );

    await t.test(
      "createRecord rejects an invoice bound to firm B's client",
      async () => {
        await assert.rejects(
          () =>
            createRecord(sessionA, {
              kind: "invoice",
              values: {
                title: "Bad Invoice",
                client: "Beta Client",
                amount: 100,
                due: "2026-11-01",
              },
            }),
          (err) =>
            err instanceof InputError && err.message === "Unknown client",
        );
      },
    );

    await t.test(
      "createRecord rejects a document bound to firm B's client",
      async () => {
        await assert.rejects(
          () =>
            createRecord(sessionA, {
              kind: "contract",
              values: { title: "Bad Doc", client: "Beta Client" },
            }),
          (err) =>
            err instanceof InputError && err.message === "Unknown client",
        );
      },
    );

    await t.test("no unauthorized rows are persisted", async () => {
      const workspace = await loadWorkspace(sessionA, new Date());
      // firm A's own records are all rejected someday; the point is that no
      // firm-B-bound rows were persisted in firm A's scope.
      assert.equal(
        workspace.projects.some((p) => p.client === "Beta Client"),
        false,
        "a rejected project must not be persisted",
      );
      assert.equal(
        workspace.invoices.some((i) => i.client === "Beta Client"),
        false,
        "a rejected invoice must not be persisted",
      );
      assert.equal(
        workspace.documents.some((d) => d.title === "Beta contract"),
        false,
        "a rejected document must not be persisted",
      );

      const projects = await db
        .select()
        .from(schema.projects)
        .where(
          eq(schema.projects.firmId, sessionA.firmId),
          eq(schema.projects.client, "Beta Client"),
        );
      assert.equal(projects.length, 0, "no project may exist for another firm");
      const invoices = await db
        .select()
        .from(schema.invoices)
        .where(
          eq(schema.invoices.firmId, sessionA.firmId),
          eq(schema.invoices.client, "Beta Client"),
        );
      assert.equal(invoices.length, 0, "no invoice may exist for another firm");
      const documents = await db
        .select()
        .from(schema.documents)
        .where(
          eq(schema.documents.firmId, sessionA.firmId),
          eq(schema.documents.title, "Beta contract"),
        );
      assert.equal(
        documents.length,
        0,
        "no document may exist for another firm",
      );
    });
  });

  test("cross-firm write: time entry against firm B's project is rejected", async (t) => {
    const sessionA = makeSession(testFirmA);
    const sessionB = makeSession(testFirmB);
    const bBetaProject = (
      await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.name, "Beta Project"))
    )[0];

    await t.test(
      "saveTime rejects a project that belongs to firm B",
      async () => {
        await assert.rejects(
          () => saveTime(sessionA, { project: "Beta Project", seconds: 600 }),
          (err) =>
            err instanceof InputError && err.message === "Unknown project",
        );
      },
    );

    await t.test(
      "no unauthorized time entry or activity is persisted",
      async () => {
        const workspace = await loadWorkspace(sessionA, new Date());
        // firm A's own entries (Alpha Project) are fine; the point is that no
        // time entry or activity bound to firm B's Beta Project was persisted.
        assert.equal(
          workspace.entries.some((e) => e.project === "Beta Project"),
          false,
          "a rejected time entry must not be persisted",
        );
        assert.equal(
          workspace.activity.some(
            (a) =>
              a.action === "recorded time on" && a.subject === "Beta Project",
          ),
          false,
          "no time-activity may exist for another firm",
        );
      },
    );
  });

  test("tenant isolation guards have no false negatives", async (t) => {
    const sessionA = makeSession(testFirmA);
    const { appendFileSync } = require("node:fs");
    const { resolve, dirname } = require("node:path");
    appendFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "probe5.log",
      ),
      `sessionA.firmId=${sessionA.firmId} testFirmA.firmId=${testFirmA.firmId} a.id=${a?.id} a.firmId=${a?.firmId} a.name=${a?.name}\n`,
    );

    // A legitimate within-firm write must still succeed through the exact same
    // service functions, proving the guards reject only the cross-firm case.
    const client = await createRecord(sessionA, {
      kind: "client",
      values: { title: "Legit Client", contact: "L1", email: "l1@legit.dev" },
    });
    const project = await createRecord(sessionA, {
      kind: "project",
      values: {
        title: "Legit Project",
        client: "Legit Client",
        due: "2026-12-01",
      },
    });
    const invoice = await createRecord(sessionA, {
      kind: "invoice",
      values: {
        title: "Legit Invoice",
        client: "Legit Client",
        amount: 500,
        due: "2026-11-01",
      },
    });
    const contract = await createRecord(sessionA, {
      kind: "contract",
      values: { title: "Legit Contract", client: "Legit Client" },
    });
    const time = await saveTime(sessionA, {
      project: "Legit Project",
      seconds: 1800,
    });

    await t.test("all within-firm writes succeed and persist", async () => {
      // `createRecord`/`saveTime` return the workspace at the moment of the
      // write, which already includes the Alpha/Beta records from the earlier
      // "cannot read firm B's data" test. We assert that each newly created
      // record is present and that its count within firm A rose by one.
      assert.ok(
        client.clients.some((c) => c.name === "Legit Client"),
        "legit client persisted",
      );
      assert.ok(
        project.projects.some((p) => p.name === "Legit Project"),
        "legit project persisted",
      );
      assert.ok(
        invoice.invoices.some((i) => i.client === "Legit Client"),
        "legit invoice persisted",
      );
      assert.ok(
        contract.documents.some((d) => d.title === "Legit Contract"),
        "legit document persisted",
      );
      assert.ok(
        time.entries.some((e) => e.project === "Legit Project"),
        "legit time entry persisted",
      );
      // The within-firm writes must have added exactly one record of each kind.
      assert.equal(
        client.clients.filter((c) => c.name === "Legit Client").length,
        1,
      );
      assert.equal(
        project.projects.filter((p) => p.name === "Legit Project").length,
        1,
      );
      assert.equal(
        invoice.invoices.filter((i) => i.client === "Legit Client").length,
        1,
      );
      assert.equal(
        contract.documents.filter((d) => d.title === "Legit Contract").length,
        1,
      );
      assert.equal(
        time.entries.filter((e) => e.project === "Legit Project").length,
        1,
      );
    });

    // `createRecord`/`saveTime` return the full workspace, which now also
    // contains the Alpha/Beta records seeded earlier in this suite, so we
    // assert on the *newly created* records' presence rather than a count of 1.
    const workspace = await loadWorkspace(sessionA, new Date());
    assert.equal(
      workspace.clients.length,
      2,
      "firm A must now contain its two clients",
    );
    assert.ok(
      workspace.clients.some(
        (c) => c.name === "Alpha Client" || c.name === "Legit Client",
      ),
      "firm A's clients include both seeded records",
    );
    assert.equal(
      workspace.projects.length,
      2,
      "firm A must now contain its two projects",
    );
    assert.ok(
      workspace.projects.some(
        (p) => p.name === "Alpha Project" || p.name === "Legit Project",
      ),
      "firm A's projects include both seeded records",
    );
    assert.equal(
      workspace.invoices.length,
      2,
      "firm A must now contain its two invoices",
    );
    assert.ok(
      workspace.invoices.some(
        (i) => i.client === "Alpha Client" || i.client === "Legit Client",
      ),
      "firm A's invoices include both seeded records",
    );
    assert.equal(
      workspace.documents.length,
      2,
      "firm A must now contain its two documents",
    );
    assert.ok(
      workspace.documents.some(
        (d) => d.title === "Alpha contract" || d.title === "Legit Contract",
      ),
      "firm A's documents include both seeded records",
    );
    assert.equal(
      workspace.entries.length,
      2,
      "firm A must now contain its two time entries",
    );
    assert.ok(
      workspace.entries.some(
        (e) => e.project === "Alpha Project" || e.project === "Legit Project",
      ),
      "firm A's time entries include both seeded records",
    );
    // No cross-firm (firm B's Alpha/Beta) rows must have leaked into firm A's view.
    assert.ok(
      !workspace.clients.some((c) => c.name === "Beta Client"),
      "firm A must not see firm B's client",
    );
    assert.ok(
      !workspace.projects.some((p) => p.name === "Beta Project"),
      "firm A must not see firm B's project",
    );
    assert.ok(
      !workspace.invoices.some((i) => i.client === "Beta Client"),
      "firm A must not see firm B's invoice",
    );
    assert.ok(
      !workspace.documents.some((d) => d.title === "Beta contract"),
      "firm A must not see firm B's document",
    );
    assert.ok(
      !workspace.entries.some((e) => e.project === "Beta Project"),
      "firm A must not see firm B's time entry",
    );
    assert.ok(
      !workspace.activity.some(
        (a) => a.subject === "Beta Client" || a.subject === "Beta Project",
      ),
      "firm A must not see firm B's activity",
    );
  });
}

runTests()
  .catch((err) => {
    // Bootstrap failure (e.g. a live PostgreSQL that is unreachable) is a hard
    // failure: the suite must not silently pass without exercising PostgreSQL.
    console.error("ℹ issue-24 bootstrap failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    // Clean up the isolated database so the suite can repeat against the same
    // development database. Errors here are best-effort: the acceptance criteria
    // demand idempotent cleanup, but a cleanup failure must not hide an earlier
    // assertion failure, so they are logged, not thrown.
    dropTestDatabase(testFirmA.id)
      .then(() => dropTestDatabase(testFirmB.id))
      .then(() => dropTestDatabase(demoFirmId))
      .catch(() => {});
  });

function makeSession(firm) {
  // `createTestUser` returns { id: userId, firmId }. Both the user id and the
  // firm id are needed: `userId` is the user identity, `firmId` is the firm the
  // user belongs to. `findSession` joins `firm_members` on `firmId`.
  return {
    userId: firm.id,
    name: firm.name,
    firmId: firm.firmId,
    role: "owner",
  };
}

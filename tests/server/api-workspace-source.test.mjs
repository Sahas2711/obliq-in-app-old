import assert from "node:assert/strict";
import { test } from "node:test";
import { createApiWorkspace } from "../../src/lib/api-workspace-source.ts";

const workspace = {
  projects: [],
  clients: [],
  invoices: [],
  documents: [],
  activity: [],
  entries: [],
};

function recorder(status = 200) {
  const calls = [];
  const request = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(workspace), { status });
  };
  return { calls, source: createApiWorkspace(request) };
}

test("loads the workspace without caching", async () => {
  const { calls, source } = recorder();
  assert.deepEqual(await source.load(), workspace);
  assert.equal(calls[0].url, "/api/workspace");
  assert.equal(calls[0].init.cache, "no-store");
});

test("posts records and time sessions as JSON", async () => {
  const { calls, source } = recorder(201);
  const values = { title: "Audit", client: "Example", due: "2026-10-10" };
  await source.create("project", values);
  await source.saveTime("Audit", 42);
  assert.equal(calls[0].url, "/api/workspace/records");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    kind: "project",
    values,
  });
  assert.equal(calls[1].url, "/api/workspace/time");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    project: "Audit",
    seconds: 42,
  });
});

test("throws on a failed request so callers can retry", async () => {
  const { source } = recorder(401);
  await assert.rejects(source.load(), /401/);
  await assert.rejects(source.saveTime("Audit", 42), /401/);
});

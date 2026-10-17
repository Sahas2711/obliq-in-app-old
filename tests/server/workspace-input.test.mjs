import assert from "node:assert/strict";
import { test } from "node:test";
import { recordInput, timeInput } from "../../src/server/workspace/input.ts";
import {
  relativeTime,
  toActivityItem,
  toISODate,
} from "../../src/server/workspace/mappers.ts";

test("keeps only the fields each record kind uses", () => {
  const parsed = recordInput.parse({
    kind: "contract",
    values: { title: " Retainer ", client: "Example", amount: 0, due: "" },
  });
  assert.deepEqual(parsed, {
    kind: "contract",
    values: { title: "Retainer", client: "Example" },
  });
});

test("rejects invalid invoices and unknown kinds", () => {
  const invoice = recordInput.safeParse({
    kind: "invoice",
    values: { title: "", client: "Example", amount: -1, due: "2026-13-01" },
  });
  assert.deepEqual(
    invoice.error.issues.map((issue) => issue.path.join(".")),
    ["values.title", "values.amount", "values.due"],
  );
  assert.equal(
    recordInput.safeParse({ kind: "tax", values: {} }).success,
    false,
  );
});

test("accepts whole-second time sessions up to a day", () => {
  assert.equal(
    timeInput.safeParse({ project: "Audit", seconds: 42 }).success,
    true,
  );
  assert.equal(
    timeInput.safeParse({ project: "Audit", seconds: 1.5 }).success,
    false,
  );
  assert.equal(
    timeInput.safeParse({ project: "Audit", seconds: 90_000 }).success,
    false,
  );
});

test("labels activity time relative to now", () => {
  const now = new Date("2026-10-04T10:00:00Z");
  const at = (iso) => relativeTime(new Date(iso), now);
  assert.equal(at("2026-10-04T09:59:30Z"), "Just now");
  assert.equal(at("2026-10-04T09:59:00Z"), "1 min ago");
  assert.equal(at("2026-10-04T08:00:00Z"), "2 hours ago");
  assert.equal(at("2026-10-03T08:00:00Z"), "Yesterday");
  assert.match(at("2026-09-20T08:00:00Z"), /^20 Sept?$/);
});

test("uses India dates for records saved late at night UTC", () => {
  assert.equal(toISODate(new Date("2026-10-04T20:00:00Z")), "2026-10-05");
});

test("shows the viewer's own activity as You", () => {
  const row = {
    id: "a",
    userId: "u1",
    person: "Naman",
    action: "created a project",
    subject: "Audit",
    type: "new",
    createdAt: new Date("2026-10-04T10:00:00Z"),
  };
  const now = new Date("2026-10-04T10:00:10Z");
  assert.equal(toActivityItem(row, "u1", now).person, "You");
  assert.equal(toActivityItem(row, "u2", now).person, "Naman");
  assert.equal(
    toActivityItem({ ...row, userId: null, person: null }, "u2", now).person,
    "A former member",
  );
});

test("sends the activity timestamp so the dashboard can label it", () => {
  const item = toActivityItem(
    {
      id: "a",
      userId: "u1",
      person: "Naman",
      action: "created a project",
      subject: "Audit",
      type: "new",
      createdAt: new Date("2026-10-04T10:00:00Z"),
    },
    "u1",
    new Date("2026-10-04T12:00:00Z"),
  );
  assert.equal(item.createdAt, "2026-10-04T10:00:00.000Z");
});

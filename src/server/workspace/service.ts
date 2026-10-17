import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { WorkspaceData } from "@/types/workspace";
import type { FirmSession } from "../auth/session.ts";
import { getDb } from "../db/client.ts";
import {
  activity,
  clients,
  documents,
  invoices,
  projects,
  timeEntries,
  users,
} from "../db/schema.ts";
import type { RecordInput } from "./input.ts";
import { toActivityItem, toISODate } from "./mappers.ts";

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

// A request that is well formed but refers to something the firm doesn't have.
export class InputError extends Error {}

// Every query is scoped to the session's firm. Never take a firm ID from the
// request body.
export async function loadWorkspace(
  session: FirmSession,
  now = new Date(),
): Promise<WorkspaceData> {
  const db = getDb();
  const { firmId } = session;
  const [
    clientRows,
    projectRows,
    invoiceRows,
    documentRows,
    activityRows,
    entryRows,
  ] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        contact: clients.contact,
        email: clients.email,
        status: clients.status,
        projects: db.$count(projects, eq(projects.clientId, clients.id)),
      })
      .from(clients)
      .where(eq(clients.firmId, firmId))
      .orderBy(desc(clients.createdAt)),
    db
      .select({
        id: projects.id,
        name: projects.name,
        client: clients.name,
        status: projects.status,
        progress: projects.progress,
        due: projects.due,
        lead: projects.lead,
        category: projects.category,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(eq(projects.firmId, firmId))
      .orderBy(desc(projects.createdAt)),
    db
      .select({
        id: invoices.id,
        client: clients.name,
        amount: invoices.amount,
        due: invoices.due,
        status: invoices.status,
        description: invoices.description,
      })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(eq(invoices.firmId, firmId))
      .orderBy(desc(invoices.createdAt)),
    db
      .select({
        id: documents.id,
        title: documents.title,
        client: clients.name,
        type: documents.type,
        updated: documents.updatedAt,
        status: documents.status,
      })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .where(eq(documents.firmId, firmId))
      .orderBy(desc(documents.createdAt)),
    db
      .select({
        id: activity.id,
        userId: activity.userId,
        person: users.name,
        action: activity.action,
        subject: activity.subject,
        type: activity.type,
        createdAt: activity.createdAt,
      })
      .from(activity)
      .leftJoin(users, eq(users.id, activity.userId))
      .where(eq(activity.firmId, firmId))
      .orderBy(desc(activity.createdAt))
      .limit(50),
    db
      .select({
        id: timeEntries.id,
        date: timeEntries.date,
        project: projects.name,
        seconds: timeEntries.seconds,
      })
      .from(timeEntries)
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(eq(timeEntries.firmId, firmId))
      .orderBy(desc(timeEntries.createdAt)),
  ]);
  return {
    clients: clientRows,
    projects: projectRows,
    invoices: invoiceRows.map(({ description, ...row }) =>
      description === null ? row : { ...row, description },
    ),
    documents: documentRows.map((row) => ({
      ...row,
      updated: toISODate(row.updated),
    })),
    activity: activityRows.map((row) =>
      toActivityItem(row, session.userId, now),
    ),
    entries: entryRows,
  };
}

export async function createRecord(session: FirmSession, input: RecordInput) {
  const { firmId, userId } = session;
  await getDb().transaction(async (tx) => {
    const log = (action: string, subject: string) =>
      tx.insert(activity).values({ firmId, userId, action, subject });
    if (input.kind === "client") {
      const { title, contact, email } = input.values;
      await tx.insert(clients).values({ firmId, name: title, contact, email });
      await log("added a client", title);
      return;
    }
    const clientId = await findClient(tx, firmId, input.values.client);
    if (input.kind === "project") {
      const { title, due } = input.values;
      await tx.insert(projects).values({
        firmId,
        clientId,
        name: title,
        due,
        lead: initials(session.name),
      });
      await log("created a project", title);
    } else if (input.kind === "invoice") {
      const { title, amount, due } = input.values;
      await tx
        .insert(invoices)
        .values({ firmId, clientId, description: title, amount, due });
      await log("saved an invoice draft for", input.values.client);
    } else {
      await tx.insert(documents).values({
        firmId,
        clientId,
        title: input.values.title,
        type: documentTypes[input.kind],
      });
      await log(`created a ${input.kind} for`, input.values.client);
    }
  });
  return loadWorkspace(session);
}

export async function saveTime(
  session: FirmSession,
  input: { project: string; seconds: number },
) {
  const { firmId, userId } = session;
  await getDb().transaction(async (tx) => {
    // The timer sends the project name today; switch to the ID with #7.
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.firmId, firmId), eq(projects.name, input.project)))
      .limit(1);
    if (!project) throw new InputError("Unknown project");
    await tx.insert(timeEntries).values({
      firmId,
      userId,
      projectId: project.id,
      date: toISODate(new Date()),
      seconds: input.seconds,
    });
    await tx.insert(activity).values({
      firmId,
      userId,
      action: "recorded time on",
      subject: input.project,
    });
  });
  return loadWorkspace(session);
}

const documentTypes = {
  proposal: "Proposal",
  contract: "Contract",
  form: "Form",
} as const;

// Forms pick clients by name today; switch to the ID with #7.
async function findClient(tx: Transaction, firmId: string, name: string) {
  const [client] = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.name, name)))
    .limit(1);
  if (!client) throw new InputError("Unknown client");
  return client.id;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

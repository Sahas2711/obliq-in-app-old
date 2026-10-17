import { dashboard } from "../data/dashboard.ts";
import { createApiWorkspace } from "./api-workspace-source.ts";
import { todayISO } from "./format.ts";
import {
  validProjects,
  validClients,
  validInvoices,
  validDocuments,
  validActivity,
  validTimeEntries,
} from "./storage-validation.ts";
import type { WorkspaceData, WorkspaceSource } from "@/types/workspace";

type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function createLocalWorkspace(
  getStorage: () => Storage | null,
): WorkspaceSource {
  let data: WorkspaceData = {
    projects: dashboard.projects,
    clients: dashboard.clients,
    invoices: dashboard.invoices,
    documents: dashboard.documents,
    activity: dashboard.activity,
    entries: [],
  };

  function read<T>(
    name: string,
    fallback: T,
    validate: (value: unknown) => value is T,
  ): T {
    try {
      const saved = getStorage()?.getItem(`obliq-preview-${name}-v1`);
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      return validate(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function write(name: string, value: unknown) {
    try {
      getStorage()?.setItem(`obliq-preview-${name}-v1`, JSON.stringify(value));
    } catch {
      /* Keep the in-memory update when browser storage is unavailable. */
    }
  }

  function addActivity(action: string, subject: string) {
    data = {
      ...data,
      activity: [
        {
          id: `ACT-${crypto.randomUUID()}`,
          person: "You",
          action,
          subject,
          time: "",
          createdAt: new Date().toISOString(),
          type: "new",
        },
        ...data.activity,
      ],
    };
    write("activity", data.activity);
  }

  return {
    async load() {
      data = {
        projects: read("projects", data.projects, validProjects),
        clients: read("clients", data.clients, validClients),
        invoices: read("invoices", data.invoices, validInvoices),
        documents: read("documents", data.documents, validDocuments),
        activity: read("activity", data.activity, validActivity),
        entries: read("time", data.entries, validTimeEntries),
      };
      return data;
    },
    async create(kind, values) {
      const id = crypto.randomUUID().slice(0, 8);
      if (kind === "project") {
        data = {
          ...data,
          projects: [
            {
              id: `PRJ-${id}`,
              name: values.title,
              client: values.client,
              status: "Planning",
              progress: 0,
              due: values.due,
              lead: "You",
              category: "General",
            },
            ...data.projects,
          ],
        };
        write("projects", data.projects);
        addActivity("created a project", values.title);
      } else if (kind === "client") {
        data = {
          ...data,
          clients: [
            {
              id: `CL-${id}`,
              name: values.title,
              contact: values.contact,
              email: values.email,
              projects: 0,
              status: "Active",
            },
            ...data.clients,
          ],
        };
        write("clients", data.clients);
        addActivity("added a client", values.title);
      } else if (kind === "invoice") {
        data = {
          ...data,
          invoices: [
            {
              id: `INV-${id}`,
              description: values.title,
              client: values.client,
              amount: values.amount,
              due: values.due,
              status: "Draft",
            },
            ...data.invoices,
          ],
        };
        write("invoices", data.invoices);
        addActivity("saved an invoice draft for", values.client);
      } else {
        data = {
          ...data,
          documents: [
            {
              id: `DOC-${id}`,
              title: values.title,
              client: values.client,
              type: {
                proposal: "Proposal",
                contract: "Contract",
                form: "Form",
              }[kind],
              updated: todayISO(),
              status: "Draft",
            },
            ...data.documents,
          ],
        };
        write("documents", data.documents);
        addActivity(`created a ${kind} for`, values.client);
      }
      return data;
    },
    async saveTime(project, seconds) {
      data = {
        ...data,
        entries: [
          {
            id: crypto.randomUUID(),
            date: todayISO(),
            project,
            seconds,
          },
          ...data.entries,
        ],
      };
      write("time", data.entries);
      addActivity("recorded time on", project);
      return data;
    },
  };
}

// NEXT_PUBLIC_WORKSPACE_SOURCE=api uses the backend; anything else keeps the
// browser preview. Storage is accessed only when an effect or action calls it.
export const workspaceSource =
  process.env.NEXT_PUBLIC_WORKSPACE_SOURCE === "api"
    ? createApiWorkspace()
    : createLocalWorkspace(() => window.localStorage);

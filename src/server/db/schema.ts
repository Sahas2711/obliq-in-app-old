import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Enum values match the strings the screens filter on, so rows map to the
// frontend types without translation.
export const userType = pgEnum("user_type", ["client", "firm"]);
export const memberRole = pgEnum("member_role", ["owner", "article_assistant"]);
export const clientStatus = pgEnum("client_status", ["Active", "Inactive"]);
export const projectStatus = pgEnum("project_status", [
  "Planning",
  "In progress",
  "Review",
  "Completed",
]);
export const invoiceStatus = pgEnum("invoice_status", [
  "Draft",
  "Awaiting payment",
  "Overdue",
  "Paid",
]);
export const documentType = pgEnum("document_type", [
  "Proposal",
  "Contract",
  "Form",
]);
export const documentStatus = pgEnum("document_status", [
  "Draft",
  "In review",
  "Ready",
]);
export const activityType = pgEnum("activity_type", [
  "new",
  "review",
  "file",
  "invoice",
]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const firmId = () =>
  uuid("firm_id")
    .notNull()
    .references(() => firms.id, { onDelete: "cascade" });

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    // Null until onboarding asks whether the user is a client or a firm (#11).
    type: userType("type"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  // One account per email, however it is capitalised.
  (table) => [uniqueIndex("users_email_idx").on(sql`lower(${table.email})`)],
);

// How a user signs in, kept apart from `users` so the login provider can
// change without touching accounts: Auth0 now (#10), passwords later.
export const userIdentities = pgTable(
  "user_identities",
  {
    provider: text("provider").notNull(),
    // The provider's ID for the user, e.g. the Auth0 `sub` claim.
    providerUserId: text("provider_user_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerUserId] }),
    index("user_identities_user_idx").on(table.userId),
  ],
);

export const firms = pgTable("firms", {
  id: id(),
  name: text("name").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const firmMembers = pgTable(
  "firm_members",
  {
    firmId: firmId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.firmId, table.userId] }),
    // getSession() looks members up by user on every request.
    index("firm_members_user_idx").on(table.userId),
  ],
);

// Codes an owner gives article assistants to join the firm (#12).
export const firmInvites = pgTable("firm_invites", {
  id: id(),
  firmId: firmId(),
  code: text("code").notNull().unique(),
  role: memberRole("role").notNull().default("article_assistant"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const clients = pgTable(
  "clients",
  {
    id: id(),
    firmId: firmId(),
    name: text("name").notNull(),
    contact: text("contact").notNull().default(""),
    email: text("email").notNull().default(""),
    status: clientStatus("status").notNull().default("Active"),
    createdAt: createdAt(),
  },
  (table) => [index("clients_firm_idx").on(table.firmId)],
);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    firmId: firmId(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    status: projectStatus("status").notNull().default("Planning"),
    progress: integer("progress").notNull().default(0),
    due: date("due").notNull(),
    lead: text("lead").notNull().default(""),
    category: text("category").notNull().default("General"),
    createdAt: createdAt(),
  },
  (table) => [index("projects_firm_idx").on(table.firmId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    firmId: firmId(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    description: text("description"),
    amount: numeric("amount", { precision: 12, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    due: date("due").notNull(),
    status: invoiceStatus("status").notNull().default("Draft"),
    createdAt: createdAt(),
  },
  (table) => [index("invoices_firm_idx").on(table.firmId)],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    firmId: firmId(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    title: text("title").notNull(),
    type: documentType("type").notNull(),
    status: documentStatus("status").notNull().default("Draft"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [index("documents_firm_idx").on(table.firmId)],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    firmId: firmId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    seconds: integer("seconds").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("time_entries_firm_idx").on(table.firmId)],
);

export const activity = pgTable(
  "activity",
  {
    id: id(),
    firmId: firmId(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    subject: text("subject").notNull(),
    type: activityType("type").notNull().default("new"),
    createdAt: createdAt(),
  },
  (table) => [index("activity_firm_idx").on(table.firmId, table.createdAt)],
);

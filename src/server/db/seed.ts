// Creates a development firm from the design fixtures for DEV_AUTH_ID.
// Run with `npm run db:seed`. Skips if the user already exists.
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { dashboard } from "../../data/dashboard.ts";
import * as schema from "./schema.ts";

const { DATABASE_URL, DEV_AUTH_ID } = process.env;
if (!DATABASE_URL || !DEV_AUTH_ID) {
  console.error("Set DATABASE_URL and DEV_AUTH_ID in .env first.");
  process.exit(1);
}

const connection = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(connection, { schema });

const [existing] = await db
  .select({ id: schema.userIdentities.userId })
  .from(schema.userIdentities)
  .where(
    and(
      eq(schema.userIdentities.provider, "dev"),
      eq(schema.userIdentities.providerUserId, DEV_AUTH_ID),
    ),
  );

if (existing) {
  console.log(`Seed skipped: ${DEV_AUTH_ID} already exists.`);
} else {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({
        email: "naman@example.com",
        name: dashboard.user.firstName,
        type: "firm",
        onboardedAt: new Date(),
      })
      .returning();
    await tx.insert(schema.userIdentities).values({
      provider: "dev",
      providerUserId: DEV_AUTH_ID,
      userId: user.id,
    });
    const [firm] = await tx
      .insert(schema.firms)
      .values({ name: "OBLIQ Demo Firm", createdBy: user.id })
      .returning();
    const firmId = firm.id;
    await tx
      .insert(schema.firmMembers)
      .values({ firmId, userId: user.id, role: "owner" });

    const clients = await tx
      .insert(schema.clients)
      .values(
        dashboard.clients.map(({ name, contact, email }) => ({
          firmId,
          name,
          contact,
          email,
        })),
      )
      .returning();
    const clientId = (name: string) => {
      const client = clients.find((item) => item.name === name);
      if (!client) throw new Error(`Fixture client not found: ${name}`);
      return client.id;
    };

    await tx.insert(schema.projects).values(
      dashboard.projects.map((item) => ({
        firmId,
        clientId: clientId(item.client),
        name: item.name,
        status: item.status as (typeof schema.projectStatus.enumValues)[number],
        progress: item.progress,
        due: item.due,
        lead: item.lead,
        category: item.category,
      })),
    );
    await tx.insert(schema.invoices).values(
      dashboard.invoices.map((item) => ({
        firmId,
        clientId: clientId(item.client),
        amount: item.amount,
        due: item.due,
        status: item.status as (typeof schema.invoiceStatus.enumValues)[number],
      })),
    );
    await tx.insert(schema.documents).values(
      dashboard.documents.map((item) => ({
        firmId,
        clientId: clientId(item.client),
        title: item.title,
        type: item.type as (typeof schema.documentType.enumValues)[number],
        status:
          item.status as (typeof schema.documentStatus.enumValues)[number],
        updatedAt: new Date(`${item.updated}T12:00:00+05:30`),
      })),
    );
  });
  console.log(`Seeded a demo firm for ${DEV_AUTH_ID}.`);
}

await connection.end();

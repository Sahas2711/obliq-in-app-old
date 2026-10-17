import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { firmMembers, userIdentities, users } from "../db/schema.ts";

export type Role = "owner" | "article_assistant";

// A signed-in user. `firmId` and `role` are null until onboarding (#11)
// creates or joins a firm.
export type Session = {
  userId: string;
  name: string;
  firmId: string | null;
  role: Role | null;
};

// A signed-in user who belongs to a firm. Workspace routes only run with this.
export type FirmSession = Session & { firmId: string; role: Role };

export function hasFirm(session: Session): session is FirmSession {
  return session.firmId !== null && session.role !== null;
}

// Until Auth0 lands (#10), development can act as the seeded user by setting
// DEV_AUTH_ID, stored as a "dev" identity. Production never takes this path
// and has no session yet.
export async function getSession(): Promise<Session | null> {
  const devId =
    process.env.NODE_ENV !== "production" ? process.env.DEV_AUTH_ID : undefined;
  if (!devId) return null;
  return findSession("dev", devId);
}

export async function findSession(
  provider: string,
  providerUserId: string,
): Promise<Session | null> {
  const [row] = await getDb()
    .select({
      userId: users.id,
      name: users.name,
      firmId: firmMembers.firmId,
      role: firmMembers.role,
    })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .leftJoin(firmMembers, eq(firmMembers.userId, users.id))
    .where(
      and(
        eq(userIdentities.provider, provider),
        eq(userIdentities.providerUserId, providerUserId),
      ),
    )
    // Firm switching isn't in v1; use the firm the user joined first.
    .orderBy(asc(firmMembers.joinedAt))
    .limit(1);
  return row ?? null;
}

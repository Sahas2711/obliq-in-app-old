import { route } from "@/server/http";
import { loadWorkspace } from "@/server/workspace/service";

export const dynamic = "force-dynamic";

export const GET = route((session) => loadWorkspace(session));

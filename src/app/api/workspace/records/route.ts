import { route } from "@/server/http";
import { recordInput } from "@/server/workspace/input";
import { createRecord } from "@/server/workspace/service";

export const POST = route(
  async (session, request) =>
    createRecord(session, recordInput.parse(await request.json())),
  201,
);

import { route } from "@/server/http";
import { timeInput } from "@/server/workspace/input";
import { saveTime } from "@/server/workspace/service";

export const POST = route(
  async (session, request) =>
    saveTime(session, timeInput.parse(await request.json())),
  201,
);

import { createTestDatabase } from "./helpers/db.ts";
try {
  const db = await createTestDatabase();
  console.log("CREATED OK");
} catch (e) {
  console.log("FAILED:", e.message);
  console.log("code:", e.code, "position:", e.position);
  process.exitCode = 1;
}

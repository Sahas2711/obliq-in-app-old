import { existsSync } from "node:fs";
console.log("loader exists:", existsSync("./tests/server/loader.mjs"));
console.log("shim exists:", existsSync("./tests/server/server-only-shim.cjs"));
try {
  await import("file:///C:/obliq-in-app/src/server/workspace/service.ts");
  console.log("service.ts loaded OK");
} catch (e) {
  console.log("service loading FAILED:", String(e.message));
  process.exit(1);
}

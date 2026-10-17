// ESM loader run via `NODE_OPTIONS=--import ./tests/server/loader.mjs`.
// Node's loader hooks (`load`, `initialize`) intercept every module load. We
// return a no-op source for the bare `server-only` package so the backend can
// be loaded in the server test runner without bundling.
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dirname = fileURLToPath(new URL(".", import.meta.url));
const shimUrl = pathToFileURL(dirname + "/server-only-shim.cjs");
const shimPath = shimUrl.href;

let called = 0;

export function load(url, context, nextLoad) {
  if (typeof url === "string" && url.includes("server-only")) {
    called += 1;
    console.log(`[loader] load: ${url} -> returning shim source`);
    return {
      format: "commonjs",
      shortCircuit: true,
      source: readFileSync(shimUrl, "utf8"),
    };
  }
  return nextLoad(url, context);
}

export function initialize() {
  console.log(`[loader] initialize called`);
}

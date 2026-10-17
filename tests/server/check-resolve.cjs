const Module = require("module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    console.log(
      "[loader] intercepting server-only ->",
      this.resolve ? this.resolve : "noresolve",
    );
    return "C:/obliq-in-app/tests/server/server-only-shim.cjs";
  }
  return orig(request, parent, isMain, options);
};
// Force reload the patch in case a prior run cached
require("module").Module._resolveFilename = Module._resolveFilename;
// Now resolve server-only the way Node would from an arbitrary file
const resolved = require.resolve("server-only");
console.log("resolved to:", resolved);

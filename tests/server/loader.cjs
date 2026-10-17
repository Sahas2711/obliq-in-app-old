// Preloader (CJS) run before the test suite via `node --require ./loader.cjs`.
// Patches Module._resolveFilename so the bare package `server-only` resolves to
// our no-op stand-in, letting the backend service layer load in the server
// test runner. The real `server-only` guard is untouched in Next.js output.
const { pathToFileURL } = require("node:url");
const { Module } = require("node:module");

const shimPath = pathToFileURL(__filename)
  .pathname.replace(/\.cjs$/, ".cjs")
  .replace("/loader.cjs", "/server-only-shim.cjs");

const originalResolve = Module._resolveFilename.bind(Module);

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return shimPath;
  }
  return originalResolve(request, parent, isMain, options);
};

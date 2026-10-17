// No-op stand-in for the `server-only` package. The real package throws when
// imported from a plain Node ESM context, which blocks the backend service
// layer from loading in the server test runner. This dummy is referenced by
// tests/server/loader.cjs.
module.exports = true;

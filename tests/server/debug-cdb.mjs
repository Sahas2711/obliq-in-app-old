import postgres from "postgres";
const PG = {
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "password",
};
const admin = postgres(
  `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/postgres`,
  { max: 1 },
);
const name = "obliq_test_1234abcd";
try {
  // Try plain template literal, no params
  await admin`CREATE DATABASE ${name}`;
  console.log("OK");
} catch (e) {
  console.log("FAILED:", e.message, "position:", e.position);
}
try {
  // Try with explicit execute-style via query
  await admin.query("CREATE DATABASE $1", [name]);
  console.log("query-style OK");
} catch (e) {
  console.log("query-style FAILED:", e.message, "position:", e.position);
}
await admin.end();

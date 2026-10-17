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
console.log("admin is:", typeof admin);
console.log("has query:", typeof admin.query);
console.log(
  "keys:",
  Object.keys(admin)
    .filter((k) => typeof admin[k] === "function")
    .join(","),
);
try {
  await admin.query("CREATE DATABASE $1", ["obliq_test_1234abcd"]);
  console.log("query OK");
} catch (e) {
  console.log("query FAILED:", e.message);
}
await admin.end();

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
try {
  // Escape $ by doubling: $${name} -> literal $ then ${name} param
  await admin`CREATE DATABASE $${name}`;
  console.log("OK");
} catch (e) {
  console.log("FAILED:", e.message);
}
await admin.end();

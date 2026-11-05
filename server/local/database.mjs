import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the local-only financial backend");
}
const parsed = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
  throw new Error("Local development backend refuses non-loopback PostgreSQL hosts");
}
export const database = postgres(process.env.DATABASE_URL, {
  max: 6, idle_timeout: 15, connect_timeout: 5, prepare: true,
});
export async function withUser(userId, work, role = "authenticated") {
  if (!["authenticated", "anon"].includes(role)) throw new Error("Invalid database role");
  if (role === "authenticated" && !userId) throw new Error("Authentication is required");
  return database.begin(async (tx) => {
    // The database user is a LOCAL-ONLY operator. Every application statement
    // runs under the restricted SQL role, with the current subject transaction-scoped.
    await tx.unsafe(role === "anon" ? "SET LOCAL ROLE anon" : "SET LOCAL ROLE authenticated");
    if (userId) await tx`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    return work(tx);
  });
}

import pg from "pg";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  const cmds = [
    "ALTER TABLE conversations ALTER COLUMN id SET DATA TYPE bigint",
    "ALTER TABLE messages ALTER COLUMN id SET DATA TYPE bigint",
    "ALTER TABLE messages ALTER COLUMN conversation_id SET DATA TYPE bigint",
    "ALTER TABLE queries ALTER COLUMN id SET DATA TYPE bigint",
    "ALTER TABLE model_responses ALTER COLUMN id SET DATA TYPE bigint",
    "ALTER TABLE model_responses ALTER COLUMN query_id SET DATA TYPE bigint",
  ];
  for (const cmd of cmds) {
    try {
      await client.query(cmd);
      console.log("OK:", cmd);
    } catch (e) {
      console.log("SKIP:", cmd, "->", e.message);
    }
  }
  console.log("\nDone - columns upgraded to bigint");
} finally {
  client.release();
  await pool.end();
}

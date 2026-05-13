import pg from "pg";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  // Check indexes
  const { rows: indexes } = await pool.query(`
    SELECT tablename, indexname, indexdef 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    ORDER BY tablename, indexname
  `);
  console.log("=== ALL INDEXES ===");
  for (const idx of indexes) {
    console.log(`  ${idx.tablename}: ${idx.indexname}`);
  }

  // Check column types
  const { rows: cols } = await pool.query(`
    SELECT table_name, column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name IN ('conversations', 'messages', 'queries', 'model_responses', 'users', 'sessions')
    ORDER BY table_name, ordinal_position
  `);
  console.log("\n=== COLUMN TYPES ===");
  let lastTable = "";
  for (const col of cols) {
    if (col.table_name !== lastTable) {
      console.log(`\n  ${col.table_name}:`);
      lastTable = col.table_name;
    }
    console.log(`    ${col.column_name}: ${col.udt_name}`);
  }

  // Check row counts
  const tables = ["users", "sessions", "conversations", "messages", "queries", "model_responses"];
  console.log("\n=== ROW COUNTS ===");
  for (const t of tables) {
    const { rows } = await pool.query(`SELECT count(*) as c FROM ${t}`);
    console.log(`  ${t}: ${rows[0].c}`);
  }
} finally {
  await pool.end();
}

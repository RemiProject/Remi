import pg from 'pg';

// Prefer a dedicated monitoring credential. The migration credential is a
// one-off fallback because this script only reads PostgreSQL statistics.
const url = process.env.DATABASE_URL_METRICS ?? process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL_METRICS (preferred), DATABASE_URL_MIGRATOR, or DATABASE_URL.');
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const ready = await client.query(`SELECT current_user AS role,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') AS installed,
    pg_has_role(current_user, 'pg_read_all_settings', 'member') AS can_read_settings,
    CASE WHEN pg_has_role(current_user, 'pg_read_all_settings', 'member')
      THEN current_setting('shared_preload_libraries') ELSE NULL END AS preloaded`);
  const { role, installed, can_read_settings: canReadSettings, preloaded } = ready.rows[0];
  if (!installed || !canReadSettings || !preloaded?.split(',').map((value) => value.trim()).includes('pg_stat_statements')) {
    const visiblePreload = canReadSettings ? preloaded || '(none)' : '(not visible to this role)';
    console.log(`Query baseline unavailable for role ${role}: pg_stat_statements installed=${installed}; preload=${visiblePreload}; settings permission=${canReadSettings}.`);
    console.log('Configure and preload pg_stat_statements, grant the required read access to a trusted measurement role, then rerun this command.');
    process.exitCode = 2;
  } else {
    const rows = await client.query(`SELECT calls, round(total_exec_time::numeric, 2) AS total_ms,
        round(mean_exec_time::numeric, 2) AS mean_ms, rows,
        shared_blks_hit, shared_blks_read, query
      FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'
      ORDER BY total_exec_time DESC LIMIT 20`);
    console.log(`Query baseline read using role ${role}; showing up to 20 statements ordered by total execution time.`);
    console.log(JSON.stringify(rows.rows, null, 2));
  }
} finally {
  await client.end();
}

import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const state = await client.query(`
    SELECT to_regclass('"SearchDocument"') IS NOT NULL AS table_exists,
      (SELECT count(*) FROM "SearchDocument" WHERE "embeddingStatus" <> 'READY' OR "embeddedContentHash" IS NULL OR "embeddingModel" IS NULL) AS not_ready,
      (SELECT count(*) FROM "SearchDocument" WHERE "embeddingStatus" = 'READY' AND "isSearchable") AS ready
  `);
  if (!state.rows[0].table_exists) throw new Error('SearchDocument table is missing; apply migrations first');
  if (Number(state.rows[0].ready) === 0) throw new Error('No ready search embeddings exist yet; configure the multilingual embedding provider and wait for the worker');
  if (Number(state.rows[0].not_ready) > 0) throw new Error('Search documents still need embeddings; wait for the worker to backfill before building HNSW');
  await client.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS "SearchDocument_embedding_hnsw_ix" ON "SearchDocument" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64) WHERE "embeddingStatus" = \'READY\' AND "isSearchable"');
  console.log('HNSW cosine index created.');
} finally {
  await client.end();
}

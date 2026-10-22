-- Phase 11: enable query statistics where the server is configured to preload them,
-- and tune vacuum/analyze thresholds for frequently updated operational tables.
DO $$
BEGIN
  IF current_setting('shared_preload_libraries') LIKE '%pg_stat_statements%'
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_stat_statements') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements';
  END IF;
END;
$$;

ALTER TABLE "InventoryItem" SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 500,
  autovacuum_analyze_threshold = 200
);

ALTER TABLE "OutboxEvent" SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 500,
  autovacuum_analyze_threshold = 200
);

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SELECT 'CREATE DATABASE ai_kitchen_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ai_kitchen_test')\gexec

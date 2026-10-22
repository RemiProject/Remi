-- Background workers need to claim and update search rows across tenants while normal reads stay RLS-scoped.
CREATE FUNCTION search_document_claim(p_model text)
RETURNS TABLE("id" uuid, "content" text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH picked AS (
    SELECT d.id FROM public."SearchDocument" d
    WHERE d."embeddingStatus" = 'PENDING'
      OR (d."embeddingStatus" = 'FAILED' AND (
        (d."embeddingAttempts" < 8 AND d."updatedAt" < now() - (interval '15 seconds' * power(2, d."embeddingAttempts")))
        OR d."embeddingModel" IS DISTINCT FROM p_model
      ))
      OR (d."embeddingStatus" = 'READY' AND d."embeddingModel" IS DISTINCT FROM p_model)
      OR (d."embeddingStatus" = 'PROCESSING' AND d."embeddingClaimedAt" < now() - interval '5 minutes')
    ORDER BY d."updatedAt" ASC, d.id
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  UPDATE public."SearchDocument" d
  SET "embeddingStatus" = 'PROCESSING', "embeddingModel" = p_model,
      "embeddingClaimedAt" = now(), "updatedAt" = now()
  FROM picked WHERE d.id = picked.id
  RETURNING d.id, d.content;
$$;

CREATE FUNCTION search_document_complete(p_id uuid, p_content text, p_hash text, p_model text, p_embedding public.vector(384))
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public."SearchDocument"
  SET "embedding" = p_embedding, "embeddedContentHash" = p_hash::char(64),
      "embeddingModel" = p_model, "embeddingAttempts" = 0,
      "embeddingStatus" = 'READY', "embeddingClaimedAt" = NULL,
      "embeddingUpdatedAt" = now(), "lastEmbeddingError" = NULL, "updatedAt" = now()
  WHERE id = p_id AND content = p_content
    AND "embeddingStatus" = 'PROCESSING' AND "embeddingModel" = p_model;
$$;

CREATE FUNCTION search_document_fail(p_id uuid, p_model text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public."SearchDocument"
  SET "embeddingStatus" = 'FAILED', "embeddingAttempts" = LEAST("embeddingAttempts" + 1, 8),
      "embeddingClaimedAt" = NULL, "lastEmbeddingError" = 'provider_error', "updatedAt" = now()
  WHERE id = p_id AND "embeddingStatus" = 'PROCESSING' AND "embeddingModel" = p_model;
$$;

REVOKE ALL ON FUNCTION search_document_claim(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION search_document_complete(uuid, text, text, text, public.vector(384)) FROM PUBLIC;
REVOKE ALL ON FUNCTION search_document_fail(uuid, text) FROM PUBLIC;

-- In this repository DATABASE_URL is also the local migration login unless a separate
-- DATABASE_URL_MIGRATOR is configured. Grant only that connected login the worker API.
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION search_document_claim(text) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION search_document_complete(uuid, text, text, text, public.vector(384)) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION search_document_fail(uuid, text) TO %I', current_user);
END;
$$;

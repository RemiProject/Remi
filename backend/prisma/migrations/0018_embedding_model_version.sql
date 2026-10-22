-- Track the model used for each vector so a model change cannot silently mix embeddings.
ALTER TABLE "SearchDocument" ADD COLUMN "embeddingModel" text;
ALTER TABLE "SearchDocument" DROP CONSTRAINT "SearchDocument_embedding_ck";
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_embedding_ck" CHECK (
  ("embeddingStatus" = 'READY' AND "embedding" IS NOT NULL AND "embeddedContentHash" IS NOT NULL AND "embeddingModel" IS NOT NULL)
  OR "embeddingStatus" <> 'READY'
);

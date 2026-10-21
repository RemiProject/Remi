import { Module } from '@nestjs/common';
import { EMBEDDING_PROVIDER, HttpEmbeddingProvider } from './embedding-provider.js';
import { EmbeddingWorker } from './embedding.worker.js';
import { SearchResolver } from './search.resolver.js';
import { SearchService } from './search.service.js';

@Module({
  providers: [
    { provide: EMBEDDING_PROVIDER, useClass: HttpEmbeddingProvider },
    EmbeddingWorker,
    SearchService,
    SearchResolver,
  ],
})
export class SearchModule {}

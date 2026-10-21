import { Module } from '@nestjs/common';
import { GetReferenceDataHandler } from './application/queries/get-reference-data/get-reference-data.handler.js';
import { ResolveRegistrationReferencesHandler } from './application/queries/resolve-registration-references/resolve-registration-references.handler.js';
import { REFERENCE_REPOSITORY } from './domain/ports/reference.repository.js';
import { PrismaReferenceRepository } from './infrastructure/repositories/prisma-reference.repository.js';
import { ReferenceResolver } from './presentation/resolvers/reference.resolver.js';

@Module({
  providers: [
    { provide: REFERENCE_REPOSITORY, useClass: PrismaReferenceRepository },
    GetReferenceDataHandler,
    ResolveRegistrationReferencesHandler,
    ReferenceResolver,
  ],
})
export class ReferenceModule {}

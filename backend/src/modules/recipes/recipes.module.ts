import { Module } from '@nestjs/common';
import { RecipeService } from './application/recipe.service.js';
import { RecipeResolver } from './presentation/recipe.resolver.js';
import { SafetyModule } from '@/modules/safety/safety.public.js';
import { RecipeSuggestionsService } from './application/recipe-suggestions.service.js';
import { RecipeSuggestionsResolver } from './presentation/recipe-suggestions.resolver.js';
import { ReceiptsModule } from '@/modules/receipts/receipts.module.js';
import { RecipeImportService } from './application/recipe-import.service.js';
import { RecipeImportResolver } from './presentation/recipe-import.resolver.js';

@Module({ imports: [SafetyModule, ReceiptsModule], providers: [RecipeService, RecipeResolver, RecipeSuggestionsService, RecipeSuggestionsResolver, RecipeImportService, RecipeImportResolver], exports: [RecipeService] })
export class RecipesModule {}

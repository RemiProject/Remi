import { Module } from '@nestjs/common';
import { RecipeService } from './application/recipe.service.js';
import { RecipeResolver } from './presentation/recipe.resolver.js';
import { SafetyModule } from '@/modules/safety/safety.public.js';
import { RecipeSuggestionsService } from './application/recipe-suggestions.service.js';
import { RecipeSuggestionsResolver } from './presentation/recipe-suggestions.resolver.js';

@Module({ imports: [SafetyModule], providers: [RecipeService, RecipeResolver, RecipeSuggestionsService, RecipeSuggestionsResolver], exports: [RecipeService] })
export class RecipesModule {}

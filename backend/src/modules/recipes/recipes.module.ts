import { Module } from '@nestjs/common';
import { RecipeService } from './application/recipe.service.js';
import { RecipeResolver } from './presentation/recipe.resolver.js';

@Module({ providers: [RecipeService, RecipeResolver], exports: [RecipeService] })
export class RecipesModule {}

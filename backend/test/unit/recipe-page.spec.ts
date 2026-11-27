import { describe, expect, it } from 'vitest';
import { isoMinutes, parseIngredientLine, recipeFromHtml, servingsOf } from '@/modules/recipes/domain/recipe-page.js';
import { Unit } from '@/shared/food-unit.js';

const page = (json: unknown, extra = '') => `<html><head><title>x</title>${extra}<script type="application/ld+json">${JSON.stringify(json)}</script></head><body>…</body></html>`;

describe('recipeFromHtml', () => {
  it('reads a plain Recipe object', () => {
    const recipe = recipeFromHtml(page({
      '@context': 'https://schema.org', '@type': 'Recipe', name: 'Shakshuka &amp; Feta', description: '<p>Eggs in a <b>spiced</b> tomato sauce.</p>',
      recipeYield: ['4', '4 servings'], prepTime: 'PT10M', cookTime: 'PT25M', totalTime: 'PT35M',
      image: ['https://example.com/a.jpg', 'https://example.com/b.jpg'], author: { '@type': 'Person', name: 'Nour' },
      recipeIngredient: ['2 tbsp olive oil', '1 onion, diced', '4 eggs'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Soften the onion.' }, { '@type': 'HowToStep', text: 'Crack in the eggs.' }],
    }));
    expect(recipe).toMatchObject({
      name: 'Shakshuka & Feta', description: 'Eggs in a spiced tomato sauce.', servings: 4, prepTimeMin: 10, cookTimeMin: 25, totalTimeMin: 35,
      imageUrl: 'https://example.com/a.jpg', author: 'Nour', ingredients: ['2 tbsp olive oil', '1 onion, diced', '4 eggs'], steps: ['Soften the onion.', 'Crack in the eggs.'],
    });
  });

  it('finds the Recipe inside an @graph next to the site and article, with grouped steps', () => {
    const recipe = recipeFromHtml(page({
      '@context': 'https://schema.org', '@graph': [
        { '@type': 'WebSite', name: 'Good Kitchen' },
        { '@type': 'Article', headline: 'My trip' },
        { '@type': ['Recipe', 'NewsArticle'], name: 'Koshari', recipeYield: 'Serves 6-8', cookTime: 'PT1H15M',
          image: { '@type': 'ImageObject', url: 'https://example.com/k.jpg' },
          recipeIngredient: ['1 cup brown lentils', '1½ cups rice'],
          recipeInstructions: [{ '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ '@type': 'HowToStep', text: 'Simmer tomatoes.' }] },
            { '@type': 'HowToSection', name: 'Rice', itemListElement: [{ '@type': 'HowToStep', name: 'Cook the rice.' }] }] },
      ],
    }));
    expect(recipe).toMatchObject({ name: 'Koshari', servings: 6, cookTimeMin: 75, siteName: 'Good Kitchen', imageUrl: 'https://example.com/k.jpg', steps: ['Simmer tomatoes.', 'Cook the rice.'] });
  });

  it('skips broken JSON-LD and pages without a recipe', () => {
    expect(recipeFromHtml('<script type="application/ld+json">{oops</script>')).toBeNull();
    expect(recipeFromHtml(page({ '@type': 'Article', headline: 'Not food' }))).toBeNull();
    expect(recipeFromHtml(page({ '@type': 'Recipe', name: 'Empty', recipeIngredient: [] }))).toBeNull();
    expect(recipeFromHtml('<p>No data here</p>')).toBeNull();
  });

  it('splits steps written as one numbered string', () => {
    const recipe = recipeFromHtml(page({ '@type': 'Recipe', name: 'Tea', recipeIngredient: ['1 tsp tea'], recipeInstructions: '1. Boil water. 2. Steep for 3 minutes.' }));
    expect(recipe?.steps).toEqual(['Boil water.', 'Steep for 3 minutes.']);
  });
});

describe('durations and servings', () => {
  it('reads ISO 8601 durations', () => {
    expect(isoMinutes('PT1H30M')).toBe(90);
    expect(isoMinutes('P0DT0H45M')).toBe(45);
    expect(isoMinutes('PT0S')).toBeNull();
    expect(isoMinutes('20 minutes')).toBeNull();
  });
  it('reads yields', () => {
    expect(servingsOf('Makes 12 cookies')).toBe(12);
    expect(servingsOf(['', '2'])).toBe(2);
    expect(servingsOf('a crowd')).toBeNull();
    expect(servingsOf(500)).toBeNull();
  });
});

describe('parseIngredientLine', () => {
  const p = (line: string) => { const r = parseIngredientLine(line); return [r.quantity, r.unit, r.name, r.optional]; };
  it('reads amounts, units and the food name', () => {
    expect(p('2 cups (250 g) plain flour, sifted')).toEqual([2, Unit.CUP, 'plain flour', false]);
    expect(p('1 1/2 tbsp olive oil')).toEqual([1.5, Unit.TABLESPOON, 'olive oil', false]);
    expect(p('½ tsp ground cumin')).toEqual([0.5, Unit.TEASPOON, 'ground cumin', false]);
    expect(p('1½ cups basmati rice')).toEqual([1.5, Unit.CUP, 'basmati rice', false]);
    expect(p('3/4 cup sugar')).toEqual([0.75, Unit.CUP, 'sugar', false]);
    expect(p('500g minced beef')).toEqual([500, Unit.GRAM, 'beef', false]);
    expect(p('2-3 garlic cloves, minced')).toEqual([2, Unit.PIECE, 'garlic cloves', false]);
    expect(p('3 cloves garlic')).toEqual([3, Unit.PIECE, 'garlic', false]);
    expect(p('4 large eggs')).toEqual([4, Unit.PIECE, 'eggs', false]);
    expect(p('2 tomatoes, chopped')).toEqual([2, Unit.PIECE, 'tomatoes', false]);
    expect(p('8 oz cream cheese, softened')).toEqual([226.8, Unit.GRAM, 'cream cheese', false]);
    expect(p('1 lb chicken breast')).toEqual([453.6, Unit.GRAM, 'chicken breast', false]);
    expect(p('1 ½ cups medium-grain rice')).toEqual([1.5, Unit.CUP, 'medium-grain rice', false]);
    expect(p('1 can 28-oz tomato sauce')).toEqual([1, Unit.PIECE, 'tomato sauce', false]);
    expect(p('1 (14-ounce) can chickpeas, drained')).toEqual([1, Unit.PIECE, 'chickpeas', false]);
  });
  it('marks optional lines and keeps lines without an amount', () => {
    expect(p('Salt and pepper, to taste')).toEqual([null, null, 'salt and pepper', true]);
    expect(p('Fresh parsley, for garnish (optional)')).toEqual([null, null, 'parsley', true]);
  });
  it('reads Arabic lines', () => {
    expect(p('٢ كوب أرز')).toEqual([2, Unit.CUP, 'أرز', false]);
    expect(p('1 ملعقة كبيرة زيت زيتون')).toEqual([1, Unit.TABLESPOON, 'زيت زيتون', false]);
    expect(p('3 فصوص ثوم مفروم')).toEqual([3, Unit.PIECE, 'ثوم', false]);
    expect(p('ملح حسب الرغبة')).toEqual([null, null, 'ملح', true]);
  });
});

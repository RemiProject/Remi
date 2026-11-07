const ingredients = [
  { names: /\b(tomato|tomatoes)\b|طماطم|طماط|قوطة|بندورة/i, image: require('../../assets/cookbook/ingredient-tomatoes.png') },
  { names: /\bspinach\b|سبانخ/i, image: require('../../assets/cookbook/ingredient-spinach.png') },
  { names: /\b(lemon|lemons)\b|ليمون/i, image: require('../../assets/cookbook/ingredient-lemon.png') },
  { names: /\b(yogurt|yoghurt|yoghurts|yogurts)\b|زبادي|زبادى|لبن زبادي/i, image: require('../../assets/cookbook/ingredient-yogurt.png') },
];

export function ingredientImage(name: string): number | undefined {
  return ingredients.find(ingredient => ingredient.names.test(name.normalize('NFKC')))?.image;
}

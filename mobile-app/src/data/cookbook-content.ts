export interface CookbookContent {
  slug: string;
  recipeId: string;
  name: string;
  nameAr: string;
  image: number;
  sourceLabel: string;
  sourceUrl: string;
  adaptationNote: string;
  imageCredit: string;
  tags: readonly string[];
  allergens: readonly string[];
  prepNote?: string;
}

export const cookbookContent: readonly CookbookContent[] = [
  {
    "slug": "tomato-pasta",
    recipeId: "26cefd9c-9ce6-4537-ae0e-0caddfd7063c",
    "name": "Roasted tomato pasta",
    "nameAr": "باستا بالطماطم المشوية",
    "sourceLabel": "NHS Healthier Families",
    "sourceUrl": "https://www.nhs.uk/healthier-families/recipes/perfect-pasta-and-tomato-sauce/",
    "adaptationNote": "Original Remi adaptation informed by the linked recipe. Ingredients, quantities and method differ; source nutrition values do not apply.",
    "tags": [
      "Vegetarian",
      "Dinner"
    ],
    "allergens": [
      "Wheat / gluten"
    ],
    "prepNote": "",
    "imageCredit": "AI-generated illustrative image created for Remi. Appearance may differ from your result.",
    image: require('../../assets/cookbook/tomato-pasta.jpg'),
  },
  {
    "slug": "shakshuka",
    recipeId: "8e949c80-5f76-4e79-a000-61488a2a9915",
    "name": "Tomato & spinach shakshuka",
    "nameAr": "شكشوكة بالطماطم والسبانخ",
    "sourceLabel": "NHS Healthier Families",
    "sourceUrl": "https://www.nhs.uk/healthier-families/recipes/shakshuka/",
    "adaptationNote": "Original Remi adaptation informed by the linked recipe. Ingredients, quantities and method differ; source nutrition values do not apply.",
    "tags": [
      "Vegetarian",
      "One pan",
      "Breakfast"
    ],
    "allergens": [
      "Egg"
    ],
    "prepNote": "",
    "imageCredit": "AI-generated illustrative image created for Remi. Appearance may differ from your result.",
    image: require('../../assets/cookbook/shakshuka.jpg'),
  },
  {
    "slug": "lentil-soup",
    recipeId: "940b3cd5-725d-46f7-a843-2e3573972de9",
    "name": "Lemon & red lentil soup",
    "nameAr": "شوربة عدس أحمر بالليمون",
    "sourceLabel": "Nutrition.gov / NIH",
    "sourceUrl": "https://www.nutrition.gov/recipes/lentil-soup",
    "adaptationNote": "Original Remi adaptation informed by the linked recipe. Ingredients, quantities and method differ; source nutrition values do not apply.",
    "tags": [
      "Vegan",
      "Soup",
      "Batch cook"
    ],
    "allergens": [],
    "prepNote": "",
    "imageCredit": "AI-generated illustrative image created for Remi. Appearance may differ from your result.",
    image: require('../../assets/cookbook/lentil-soup.jpg'),
  },
  {
    "slug": "chickpea-salad",
    recipeId: "859029a1-be76-43af-aa73-cc7b38e341b1",
    "name": "Chickpea & feta salad",
    "nameAr": "سلطة الحمص والفيتا",
    "sourceLabel": "NHS Healthier Families",
    "sourceUrl": "https://www.nhs.uk/healthier-families/recipes/greek-salad/",
    "adaptationNote": "Original Remi adaptation informed by the linked recipe. Ingredients, quantities and method differ; source nutrition values do not apply.",
    "tags": [
      "Vegetarian",
      "No cook",
      "Lunch"
    ],
    "allergens": [
      "Milk"
    ],
    "prepNote": "",
    "imageCredit": "AI-generated illustrative image created for Remi. Appearance may differ from your result.",
    image: require('../../assets/cookbook/chickpea-salad.jpg'),
  },
  {
    "slug": "overnight-oats",
    recipeId: "d543a79d-c9f9-46e3-a8d7-de7702f28471",
    "name": "Berry overnight oats",
    "nameAr": "شوفان بالتوت لليوم التالي",
    "sourceLabel": "NHS Healthier Families",
    "sourceUrl": "https://www.nhs.uk/healthier-families/recipes/easy-overnight-oats/",
    "adaptationNote": "Original Remi adaptation informed by the linked recipe. Ingredients, quantities and method differ; source nutrition values do not apply.",
    "tags": [
      "Vegetarian",
      "Breakfast",
      "Make ahead"
    ],
    "allergens": [
      "Milk",
      "Oats — may contain gluten"
    ],
    "prepNote": "Chill for at least 6 hours or overnight.",
    "imageCredit": "AI-generated illustrative image created for Remi. Appearance may differ from your result.",
    image: require('../../assets/cookbook/overnight-oats.jpg'),
  },
  {
    "slug": "spinach-frittata",
    recipeId: "88f86c86-0fc1-4c10-afc2-fd3064163051",
    "name": "Spinach & potato frittata",
    "nameAr": "فريتاتا بالسبانخ والبطاطس",
    "sourceLabel": "American Academy of Pediatrics / ChopChop",
    "sourceUrl": "https://www.healthychildren.org/English/healthy-living/nutrition/chop-chop-magazine/Pages/Recipe-Baked-Vegetable-Frittata.aspx",
    "adaptationNote": "Original Remi adaptation informed by the linked recipe. Ingredients, quantities and method differ; source nutrition values do not apply.",
    "tags": [
      "Vegetarian",
      "Lunch",
      "Batch cook"
    ],
    "allergens": [
      "Egg",
      "Milk"
    ],
    "prepNote": "",
    "imageCredit": "AI-generated illustrative image created for Remi. Appearance may differ from your result.",
    image: require('../../assets/cookbook/spinach-frittata.jpg'),
  },
  {
    "slug": "hummus-wrap",
    recipeId: "c152b243-8d11-4717-a248-4237fd505e28",
    "name": "Hummus & crunchy vegetable wraps",
    "nameAr": "لفائف الحمص والخضار",
    "sourceLabel": "NHS Healthier Families",
    "sourceUrl": "https://www.nhs.uk/healthier-families/recipes/hummus-and-salad-wrap/",
    "adaptationNote": "Original Remi adaptation informed by the linked recipe. Ingredients, quantities and method differ; source nutrition values do not apply.",
    "tags": [
      "Vegan",
      "Lunch",
      "No cook"
    ],
    "allergens": [
      "Wheat / gluten",
      "Sesame"
    ],
    "prepNote": "Use soft wholemeal flatbreads or wraps; check hummus labels for allergens.",
    "imageCredit": "AI-generated illustrative image created for Remi. Appearance may differ from your result.",
    image: require('../../assets/cookbook/hummus-wrap.jpg'),
  },
  {
    "slug": "ful-medames",
    recipeId: "e6428b5a-a7af-4394-a9aa-b10f012c2d1c",
    "name": "Egyptian ful medames",
    "nameAr": "فول مدمس مصري",
    "sourceLabel": "Good Food / Mitshel Ibrahim",
    "sourceUrl": "https://www.bbcgoodfood.com/recipes/ful-medames",
    "adaptationNote": "Original Remi adaptation informed by the linked recipe. Ingredients, quantities and method differ; source nutrition values do not apply.",
    "tags": [
      "Vegan",
      "Egyptian",
      "Breakfast"
    ],
    "allergens": [
      "Sesame"
    ],
    "prepNote": "Fava beans can trigger favism in people with G6PD deficiency; choose a different recipe if affected.",
    "imageCredit": "AI-generated illustrative image created for Remi. Appearance may differ from your result.",
    image: require('../../assets/cookbook/ful-medames.jpg'),
  }
];

export function getCookbookContent(name: string, recipeId?: string): CookbookContent | undefined {
  const normalized = name.trim().toLocaleLowerCase();
  return cookbookContent.find(recipe => recipe.name.toLocaleLowerCase() === normalized && (recipeId === undefined || recipe.recipeId === recipeId));
}

export const leftoverSafety = {
  title: 'Store leftovers safely',
  body: 'Refrigerate promptly in shallow containers. Discard cooked food left at room temperature for more than 2 hours. Eat refrigerated leftovers within 2–3 days or freeze them. Reheat to 74°C using a food thermometer. Appearance and smell cannot establish safety.',
  sourceLabel: 'Health Canada',
  sourceUrl: 'https://www.canada.ca/en/health-canada/services/general-food-safety-tips/food-safety-tips-leftovers.html',
};

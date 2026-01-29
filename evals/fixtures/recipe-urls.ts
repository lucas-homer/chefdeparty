// Test URLs and expected outputs for recipe parsing evaluation

export const recipeUrlTestCases = [
  {
    name: "Simple recipe with clear structure",
    url: "https://example.com/simple-pasta-recipe",
    // Mocked content that would be fetched from the URL
    content: `
      <h1>Simple Garlic Pasta</h1>
      <p>A quick and easy pasta dish</p>
      <div class="recipe-meta">
        <span>Prep: 10 minutes</span>
        <span>Cook: 15 minutes</span>
        <span>Servings: 4</span>
      </div>
      <h2>Ingredients</h2>
      <ul>
        <li>1 pound spaghetti</li>
        <li>4 cloves garlic, minced</li>
        <li>1/4 cup olive oil</li>
        <li>1/2 teaspoon red pepper flakes</li>
        <li>Salt and pepper to taste</li>
        <li>Fresh parsley for garnish</li>
      </ul>
      <h2>Instructions</h2>
      <ol>
        <li>Cook pasta according to package directions until al dente.</li>
        <li>Meanwhile, heat olive oil in a large skillet over medium heat.</li>
        <li>Add garlic and red pepper flakes, cook until fragrant (about 1 minute).</li>
        <li>Drain pasta, reserving 1/2 cup pasta water.</li>
        <li>Toss pasta with garlic oil, adding pasta water as needed.</li>
        <li>Season with salt and pepper, garnish with parsley.</li>
      </ol>
    `,
    expected: {
      name: "Simple Garlic Pasta",
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      servings: 4,
      ingredientCount: 6,
      instructionCount: 6,
    },
  },
  {
    name: "Recipe with metric measurements",
    url: "https://example.com/metric-recipe",
    content: `
      <h1>Chocolate Chip Cookies</h1>
      <div class="time">Prep: 20 min | Bake: 12 min | Makes: 24 cookies</div>
      <h3>Ingredients:</h3>
      <ul>
        <li>250g all-purpose flour</li>
        <li>150g butter, softened</li>
        <li>100g granulated sugar</li>
        <li>100g brown sugar</li>
        <li>2 eggs</li>
        <li>1 tsp vanilla extract</li>
        <li>1 tsp baking soda</li>
        <li>200g chocolate chips</li>
      </ul>
      <h3>Method:</h3>
      <p>1. Cream butter and sugars. 2. Add eggs and vanilla. 3. Mix in flour and baking soda. 4. Fold in chocolate chips. 5. Drop spoonfuls onto baking sheet. 6. Bake at 180°C for 10-12 minutes.</p>
    `,
    expected: {
      name: "Chocolate Chip Cookies",
      prepTimeMinutes: 20,
      cookTimeMinutes: 12,
      servings: 24,
      ingredientCount: 8,
      instructionCount: 6,
    },
  },
];

export const recipePhotoTestCases = [
  {
    name: "Handwritten recipe card",
    imagePath: "evals/fixtures/images/handwritten-recipe.jpg",
    expected: {
      hasName: true,
      hasIngredients: true,
      hasInstructions: true,
      minIngredients: 3,
    },
  },
  {
    name: "Printed recipe from cookbook",
    imagePath: "evals/fixtures/images/cookbook-page.jpg",
    expected: {
      hasName: true,
      hasIngredients: true,
      hasInstructions: true,
      minIngredients: 5,
    },
  },
];

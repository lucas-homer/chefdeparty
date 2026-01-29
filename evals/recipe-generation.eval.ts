import { evalite } from "evalite";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { Levenshtein } from "autoevals";

// Test cases for recipe generation
const recipePrompts = [
  {
    input: {
      description: "A quick vegetarian pasta dish for 4 people",
      dietaryRestrictions: ["vegetarian"],
      servings: 4,
      maxPrepTime: 30,
    },
    expected: {
      isVegetarian: true,
      hasServings: true,
      hasPrepTime: true,
      hasIngredients: true,
      hasInstructions: true,
    },
  },
  {
    input: {
      description: "A gluten-free chocolate dessert",
      dietaryRestrictions: ["gluten-free"],
      servings: 8,
    },
    expected: {
      isGlutenFree: true,
      hasServings: true,
      hasIngredients: true,
      hasInstructions: true,
    },
  },
  {
    input: {
      description: "A healthy salad with protein for lunch",
      dietaryRestrictions: [],
      servings: 2,
      maxPrepTime: 15,
    },
    expected: {
      hasProtein: true,
      hasServings: true,
      hasIngredients: true,
      hasInstructions: true,
    },
  },
];

// System prompt for recipe generation
const systemPrompt = `You are a professional chef assistant. Generate recipes based on user requirements.
Always respond with valid JSON in this format:
{
  "name": "Recipe Name",
  "description": "Brief description",
  "servings": number,
  "prepTimeMinutes": number,
  "cookTimeMinutes": number,
  "ingredients": [{"name": "ingredient", "quantity": "amount", "unit": "unit"}],
  "instructions": ["step 1", "step 2", ...]
}`;

evalite("Recipe Generation", {
  data: async () => recipePrompts,

  task: async (input) => {
    const prompt = `Generate a recipe for: ${input.description}
${input.dietaryRestrictions.length > 0 ? `Dietary restrictions: ${input.dietaryRestrictions.join(", ")}` : ""}
Servings: ${input.servings}
${input.maxPrepTime ? `Maximum prep time: ${input.maxPrepTime} minutes` : ""}`;

    const result = await generateText({
      model: anthropic("claude-3-5-sonnet-20241022"),
      system: systemPrompt,
      prompt,
    });

    try {
      return JSON.parse(result.text);
    } catch {
      return { error: "Failed to parse JSON", raw: result.text };
    }
  },

  scorers: [
    // Check if recipe has required fields
    {
      name: "Has Required Fields",
      scorer: async ({ output }) => {
        if (output.error) return 0;

        const hasName = !!output.name;
        const hasIngredients =
          Array.isArray(output.ingredients) && output.ingredients.length > 0;
        const hasInstructions =
          Array.isArray(output.instructions) && output.instructions.length > 0;
        const hasServings = typeof output.servings === "number";

        const score = [hasName, hasIngredients, hasInstructions, hasServings].filter(
          Boolean
        ).length / 4;

        return score;
      },
    },

    // Check dietary compliance
    {
      name: "Dietary Compliance",
      scorer: async ({ input, output }) => {
        if (output.error) return 0;
        if (input.dietaryRestrictions.length === 0) return 1;

        const ingredients = output.ingredients || [];
        const ingredientNames = ingredients
          .map((i: { name: string }) => i.name.toLowerCase())
          .join(" ");

        // Simple checks for common restrictions
        if (input.dietaryRestrictions.includes("vegetarian")) {
          const meatKeywords = ["chicken", "beef", "pork", "fish", "bacon", "ham"];
          const containsMeat = meatKeywords.some((m) =>
            ingredientNames.includes(m)
          );
          if (containsMeat) return 0;
        }

        if (input.dietaryRestrictions.includes("gluten-free")) {
          const glutenKeywords = ["flour", "bread", "pasta", "wheat"];
          const containsGluten = glutenKeywords.some((g) =>
            ingredientNames.includes(g)
          );
          if (containsGluten) return 0;
        }

        return 1;
      },
    },
  ],
});

// A/B test different models
evalite.each([
  { name: "Claude 3.5 Sonnet", model: anthropic("claude-3-5-sonnet-20241022") },
  { name: "GPT-4o", model: openai("gpt-4o") },
])("Recipe Generation - $name", {
  data: async () => recipePrompts.slice(0, 1), // Just test first case for model comparison

  task: async (input, { model }) => {
    const prompt = `Generate a recipe for: ${input.description}
Servings: ${input.servings}`;

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt,
    });

    try {
      return JSON.parse(result.text);
    } catch {
      return { error: "Failed to parse JSON", raw: result.text };
    }
  },

  scorers: [
    {
      name: "Valid JSON Output",
      scorer: async ({ output }) => (output.error ? 0 : 1),
    },
    Levenshtein({
      output: "name",
      expected: "A vegetarian pasta dish",
    }),
  ],
});

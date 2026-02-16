import { evalite, createScorer } from "evalite";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { Levenshtein } from "autoevals";

const hasGoogleApiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

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

type RecipeEvalInput = {
  description: string;
  dietaryRestrictions: string[];
  servings: number;
  maxPrepTime?: number;
};

type GeneratedRecipeOutput = {
  error?: string;
  raw?: string;
  name?: string;
  ingredients?: Array<{ name: string }>;
  instructions?: string[];
  servings?: number;
};

const hasRequiredFieldsScorer = createScorer<RecipeEvalInput, GeneratedRecipeOutput>({
  name: "Has Required Fields",
  scorer: async ({ output }) => {
    if (output.error) return 0;

    const hasName = !!output.name;
    const hasIngredients =
      Array.isArray(output.ingredients) && output.ingredients.length > 0;
    const hasInstructions =
      Array.isArray(output.instructions) && output.instructions.length > 0;
    const hasServings = typeof output.servings === "number";

    return [hasName, hasIngredients, hasInstructions, hasServings].filter(Boolean).length / 4;
  },
});

const dietaryComplianceScorer = createScorer<RecipeEvalInput, GeneratedRecipeOutput>({
  name: "Dietary Compliance",
  scorer: async ({ input, output }) => {
    if (output.error) return 0;
    if (input.dietaryRestrictions.length === 0) return 1;

    const ingredients = output.ingredients || [];
    const ingredientNames = ingredients
      .map((i: { name: string }) => i.name.toLowerCase())
      .join(" ");

    if (input.dietaryRestrictions.includes("vegetarian")) {
      const meatKeywords = ["chicken", "beef", "pork", "fish", "bacon", "ham"];
      if (meatKeywords.some((m) => ingredientNames.includes(m))) return 0;
    }

    if (input.dietaryRestrictions.includes("gluten-free")) {
      const glutenKeywords = ["flour", "bread", "pasta", "wheat"];
      if (glutenKeywords.some((g) => ingredientNames.includes(g))) return 0;
    }

    return 1;
  },
});

if (!hasGoogleApiKey) {
  evalite("Recipe Generation (skipped: missing GOOGLE_GENERATIVE_AI_API_KEY)", {
    data: async () => [{ input: "missing-api-key", expected: "missing-api-key" }],
    task: async () => "missing-api-key",
    scorers: [
      createScorer({
        name: "Skipped",
        scorer: async () => 1,
      }),
    ],
  });
} else {
  evalite("Recipe Generation", {
    data: async () => recipePrompts,
    task: async (input) => {
      const prompt = `Generate a recipe for: ${input.description}
${input.dietaryRestrictions.length > 0 ? `Dietary restrictions: ${input.dietaryRestrictions.join(", ")}` : ""}
Servings: ${input.servings}
${input.maxPrepTime ? `Maximum prep time: ${input.maxPrepTime} minutes` : ""}`;

      const result = await generateText({
        model: google("gemini-2.5-flash"),
        system: systemPrompt,
        prompt,
      });

      try {
        return JSON.parse(result.text);
      } catch {
        return { error: "Failed to parse JSON", raw: result.text };
      }
    },
    scorers: [hasRequiredFieldsScorer, dietaryComplianceScorer],
  });

  const comparisonModels = [
    { name: "Gemini 2.5 Flash", model: google("gemini-2.5-flash") },
    { name: "Gemini 2.5 Flash Lite", model: google("gemini-2.5-flash-lite") },
  ] as const;

  for (const config of comparisonModels) {
    evalite(`Recipe Generation - ${config.name}`, {
      data: async () => recipePrompts.slice(0, 1),
      task: async (input) => {
        const prompt = `Generate a recipe for: ${input.description}
Servings: ${input.servings}`;

        const result = await generateText({
          model: config.model,
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
        createScorer({
          name: "Valid JSON Output",
          scorer: async ({ output }) => (output.error ? 0 : 1),
        }),
        Levenshtein({
          output: "name",
          expected: "A vegetarian pasta dish",
        }),
      ],
    });
  }
}

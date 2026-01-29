import { faker } from "@faker-js/faker";
import type {
  NewRecipe,
  Ingredient,
  Instruction,
  DietaryTag,
} from "../../../drizzle/schema";

const units = ["cup", "cups", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "lb", "oz", "g", "ml", ""];
const ingredientList = [
  "flour",
  "sugar",
  "salt",
  "butter",
  "eggs",
  "milk",
  "olive oil",
  "garlic",
  "onion",
  "tomatoes",
  "chicken",
  "beef",
  "pasta",
  "rice",
  "cheese",
  "basil",
  "oregano",
  "pepper",
  "lemon",
  "parsley",
];

const dietaryTags: DietaryTag[] = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "contains-alcohol",
  "contains-eggs",
  "contains-dairy",
  "contains-nuts",
  "contains-shellfish",
  "contains-fish",
];

/**
 * Creates a recipe factory with Faker.
 */
export function createRecipeFactory() {
  return {
    /**
     * Build a single ingredient.
     */
    buildIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
      return {
        amount: faker.number.int({ min: 1, max: 4 }).toString(),
        unit: faker.helpers.arrayElement(units),
        ingredient: faker.helpers.arrayElement(ingredientList),
        notes: faker.datatype.boolean() ? faker.lorem.words(2) : undefined,
        section: undefined,
        ...overrides,
      };
    },

    /**
     * Build multiple ingredients.
     */
    buildIngredients(count: number = 5): Ingredient[] {
      return Array.from({ length: count }, () => this.buildIngredient());
    },

    /**
     * Build instructions for a recipe.
     */
    buildInstructions(count: number = 4): Instruction[] {
      return Array.from({ length: count }, (_, i) => ({
        step: i + 1,
        description: faker.lorem.sentence(),
      }));
    },

    /**
     * Build a recipe object without persisting to database.
     */
    build(overrides: Partial<NewRecipe> = {}): NewRecipe {
      const recipeTypes = ["url", "photo", "ai", "manual"] as const;

      return {
        id: faker.string.uuid(),
        ownerId: faker.string.uuid(),
        name: `${faker.word.adjective()} ${faker.food.dish()}`,
        description: faker.lorem.paragraph(),
        sourceUrl: faker.datatype.boolean() ? faker.internet.url() : null,
        sourceType: faker.helpers.arrayElement(recipeTypes),
        copiedFromId: null,
        shareToken: faker.string.alphanumeric(8),
        ingredients: this.buildIngredients(faker.number.int({ min: 4, max: 10 })),
        instructions: this.buildInstructions(faker.number.int({ min: 3, max: 8 })),
        prepTimeMinutes: faker.number.int({ min: 5, max: 60 }),
        cookTimeMinutes: faker.number.int({ min: 10, max: 120 }),
        servings: faker.number.int({ min: 2, max: 12 }),
        tags: faker.helpers.arrayElements(
          ["quick", "easy", "comfort food", "healthy", "indulgent"],
          faker.number.int({ min: 0, max: 3 })
        ),
        dietaryTags: faker.helpers.arrayElements(
          dietaryTags,
          faker.number.int({ min: 0, max: 3 })
        ),
        createdAt: faker.date.past(),
        updatedAt: faker.date.recent(),
        ...overrides,
      };
    },

    /**
     * Build multiple recipes.
     */
    buildMany(count: number, overrides: Partial<NewRecipe> = {}): NewRecipe[] {
      return Array.from({ length: count }, () => this.build(overrides));
    },

    /**
     * Build a vegetarian recipe.
     */
    buildVegetarian(overrides: Partial<NewRecipe> = {}): NewRecipe {
      return this.build({
        dietaryTags: ["vegetarian"],
        ...overrides,
      });
    },

    /**
     * Build a quick recipe (under 30 min total).
     */
    buildQuick(overrides: Partial<NewRecipe> = {}): NewRecipe {
      return this.build({
        prepTimeMinutes: faker.number.int({ min: 5, max: 10 }),
        cookTimeMinutes: faker.number.int({ min: 10, max: 20 }),
        tags: ["quick", "easy"],
        ...overrides,
      });
    },
  };
}

export const recipeFactory = createRecipeFactory();

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, isNull, and } from "drizzle-orm";
import { recipes } from "../../../drizzle/schema";
import { requireAuth, getUser } from "../../lib/hono-auth";
import { createRecipeSchema, updateRecipeSchema, importUrlSchema, aiRecipeExtractionSchema } from "../../lib/schemas";
import type { Env } from "../../index";
import type { createDb } from "../../lib/db";

type Variables = {
  db: ReturnType<typeof createDb>;
};

type AppContext = { Bindings: Env; Variables: Variables };

// Chain routes for type inference
const recipesRoutes = new Hono<AppContext>()
  .use("*", requireAuth)

  // GET /api/recipes - List all recipes for current user
  .get("/", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const includeCopies = c.req.query("includeCopies") === "true";

    const userRecipes = includeCopies
      ? await db
          .select()
          .from(recipes)
          .where(eq(recipes.ownerId, user.id))
          .orderBy(desc(recipes.createdAt))
      : await db
          .select()
          .from(recipes)
          .where(and(eq(recipes.ownerId, user.id), isNull(recipes.copiedFromId)))
          .orderBy(desc(recipes.createdAt));

    return c.json(userRecipes);
  })

  // GET /api/recipes/:id - Get a specific recipe
  .get("/:id", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");
    const db = c.get("db");

    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.ownerId, user.id)));

    if (!recipe) {
      return c.json({ error: "Recipe not found" }, 404);
    }

    return c.json(recipe);
  })

  // POST /api/recipes - Create a new recipe
  .post("/", zValidator("json", createRecipeSchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const data = c.req.valid("json");

    // Generate share token for public sharing
    const shareToken = crypto.randomUUID().slice(0, 8);

    const [newRecipe] = await db
      .insert(recipes)
      .values({
        ownerId: user.id,
        name: data.name,
        description: data.description || null,
        sourceUrl: data.sourceUrl || null,
        sourceType: data.sourceType || "manual",
        shareToken,
        ingredients: data.ingredients,
        instructions: data.instructions,
        prepTimeMinutes: data.prepTimeMinutes || null,
        cookTimeMinutes: data.cookTimeMinutes || null,
        servings: data.servings || null,
        tags: data.tags || [],
        dietaryTags: data.dietaryTags || [],
      })
      .returning();

    return c.json(newRecipe, 201);
  })

  // PUT /api/recipes/:id - Update a recipe
  .put("/:id", zValidator("json", updateRecipeSchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");
    const db = c.get("db");

    // Verify ownership
    const [existing] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.ownerId, user.id)));

    if (!existing) {
      return c.json({ error: "Recipe not found" }, 404);
    }

    const data = c.req.valid("json");

    const [updated] = await db
      .update(recipes)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.sourceUrl !== undefined && { sourceUrl: data.sourceUrl }),
        ...(data.ingredients !== undefined && { ingredients: data.ingredients }),
        ...(data.instructions !== undefined && { instructions: data.instructions }),
        ...(data.prepTimeMinutes !== undefined && { prepTimeMinutes: data.prepTimeMinutes }),
        ...(data.cookTimeMinutes !== undefined && { cookTimeMinutes: data.cookTimeMinutes }),
        ...(data.servings !== undefined && { servings: data.servings }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.dietaryTags !== undefined && { dietaryTags: data.dietaryTags }),
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id))
      .returning();

    return c.json(updated);
  })

  // DELETE /api/recipes/:id - Delete a recipe
  .delete("/:id", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");
    const db = c.get("db");

    const [deleted] = await db
      .delete(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.ownerId, user.id)))
      .returning();

    if (!deleted) {
      return c.json({ error: "Recipe not found" }, 404);
    }

    return c.json({ success: true });
  })

  // POST /api/recipes/:id/copy - Copy a recipe (for party menus)
  .post("/:id/copy", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");
    const db = c.get("db");

    // Get the original recipe
    const [original] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.ownerId, user.id)));

    if (!original) {
      return c.json({ error: "Recipe not found" }, 404);
    }

    // Create a copy with reference to the original
    const [copy] = await db
      .insert(recipes)
      .values({
        ownerId: user.id,
        name: original.name,
        description: original.description,
        sourceUrl: original.sourceUrl,
        sourceType: original.sourceType,
        copiedFromId: original.id,
        ingredients: original.ingredients,
        instructions: original.instructions,
        prepTimeMinutes: original.prepTimeMinutes,
        cookTimeMinutes: original.cookTimeMinutes,
        servings: original.servings,
        tags: original.tags,
        dietaryTags: original.dietaryTags,
      })
      .returning();

    return c.json(copy, 201);
  })

  // POST /api/recipes/import-url - Import recipe from URL
  .post("/import-url", zValidator("json", importUrlSchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const { url } = c.req.valid("json");

    // Dynamically import AI dependencies
    const { generateObject } = await import("ai");
    const { createAI } = await import("../../lib/ai");
    const { defaultModel } = createAI(c.env.GOOGLE_GENERATIVE_AI_API_KEY);

    // Fetch via Tavily
    const tavilyRes = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ urls: [url] }),
    });

    if (!tavilyRes.ok) {
      return c.json({ error: "Failed to fetch URL content" }, 400);
    }

    const tavilyData = (await tavilyRes.json()) as {
      results: Array<{ raw_content?: string; content?: string }>;
    };
    const content = tavilyData.results[0]?.raw_content || tavilyData.results[0]?.content;

    if (!content) {
      return c.json({ error: "Could not extract content from URL" }, 400);
    }

    // Extract with AI
    const { object: recipe } = await generateObject({
      model: defaultModel,
      schema: aiRecipeExtractionSchema,
      prompt: `Extract the recipe from this webpage. Parse ingredients with amount/unit/name separated. If you can't find a valid recipe, return a recipe with name "Unknown Recipe".\n\n${content}`,
    });

    const shareToken = crypto.randomUUID().slice(0, 8);
    const [newRecipe] = await db
      .insert(recipes)
      .values({
        ownerId: user.id,
        shareToken,
        name: recipe.name,
        description: recipe.description || null,
        sourceUrl: url,
        sourceType: "url",
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        prepTimeMinutes: recipe.prepTimeMinutes || null,
        cookTimeMinutes: recipe.cookTimeMinutes || null,
        servings: recipe.servings || null,
        tags: recipe.tags || [],
        dietaryTags: recipe.dietaryTags || [],
      })
      .returning();

    return c.json(newRecipe, 201);
  })

  // POST /api/recipes/import-image - Import recipe from image
  .post("/import-image", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");

    const formData = await c.req.formData();
    const imageFile = formData.get("image") as File | null;
    if (!imageFile) {
      return c.json({ error: "No image provided" }, 400);
    }

    // Convert to base64 (chunked to avoid stack overflow with large files)
    const arrayBuffer = await imageFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:${imageFile.type};base64,${base64}`;

    // Dynamically import AI dependencies
    const { generateObject } = await import("ai");
    const { createAI } = await import("../../lib/ai");
    const { visionModel } = createAI(c.env.GOOGLE_GENERATIVE_AI_API_KEY);

    // Extract with vision model
    const { object: recipe } = await generateObject({
      model: visionModel,
      schema: aiRecipeExtractionSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: dataUrl },
            { type: "text", text: "Extract the recipe from this image. Parse ingredients with amount/unit/name separated." },
          ],
        },
      ],
    });

    const shareToken = crypto.randomUUID().slice(0, 8);
    const [newRecipe] = await db
      .insert(recipes)
      .values({
        ownerId: user.id,
        shareToken,
        name: recipe.name,
        description: recipe.description || null,
        sourceType: "photo",
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        prepTimeMinutes: recipe.prepTimeMinutes || null,
        cookTimeMinutes: recipe.cookTimeMinutes || null,
        servings: recipe.servings || null,
        tags: recipe.tags || [],
        dietaryTags: recipe.dietaryTags || [],
      })
      .returning();

    return c.json(newRecipe, 201);
  })

  // POST /api/recipes/generate - Generate recipe from chat
  .post("/generate", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const { messages } = await c.req.json();

    // Dynamically import AI dependencies
    const { streamText, tool } = await import("ai");
    const { createAI } = await import("../../lib/ai");
    const { defaultModel } = createAI(c.env.GOOGLE_GENERATIVE_AI_API_KEY);

    const result = streamText({
      model: defaultModel,
      system: `You are a helpful chef assistant. Help create a recipe based on user requests.
Ask about dietary restrictions, serving size, available ingredients, skill level.
When you have enough information to create a complete recipe, use the saveRecipe tool.
Be conversational and helpful.`,
      messages,
      tools: {
        saveRecipe: tool({
          description: "Save the generated recipe to the user's recipe collection",
          parameters: aiRecipeExtractionSchema,
          execute: async (recipe) => {
            const shareToken = crypto.randomUUID().slice(0, 8);
            const [newRecipe] = await db
              .insert(recipes)
              .values({
                ownerId: user.id,
                shareToken,
                name: recipe.name,
                description: recipe.description || null,
                sourceType: "ai",
                ingredients: recipe.ingredients,
                instructions: recipe.instructions,
                prepTimeMinutes: recipe.prepTimeMinutes || null,
                cookTimeMinutes: recipe.cookTimeMinutes || null,
                servings: recipe.servings || null,
                tags: recipe.tags || [],
                dietaryTags: [],
              })
              .returning();
            return { success: true, recipeId: newRecipe.id, title: newRecipe.name };
          },
        }),
      },
      maxSteps: 5,
    });

    return result.toDataStreamResponse();
  });

// Export type for client
export type RecipesRoutes = typeof recipesRoutes;
export { recipesRoutes };

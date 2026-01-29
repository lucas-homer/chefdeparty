import React, { useState, useCallback, FormEvent, ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { hc } from "hono/client";
import type { ApiRoutes } from "../src/routes/api";

// Create typed client
const client = hc<ApiRoutes>("/api");

// Types
interface Ingredient {
  amount?: string;
  unit?: string;
  ingredient: string;
  notes?: string;
  section?: string;
}

interface Instruction {
  step: number;
  description: string;
  section?: string;
}

interface RecipeFormProps {
  recipeId?: string;
  initialData?: {
    name: string;
    description: string;
    ingredients: Ingredient[];
    instructions: Instruction[];
    prepTimeMinutes?: number;
    cookTimeMinutes?: number;
    servings?: number;
    tags?: string[];
  };
}

function RecipeForm({ recipeId, initialData }: RecipeFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initialData?.ingredients || [{ ingredient: "" }]
  );
  const [instructions, setInstructions] = useState<Instruction[]>(
    initialData?.instructions || [{ step: 1, description: "" }]
  );
  const [prepTime, setPrepTime] = useState(initialData?.prepTimeMinutes || 0);
  const [cookTime, setCookTime] = useState(initialData?.cookTimeMinutes || 0);
  const [servings, setServings] = useState(initialData?.servings || 4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addIngredient = useCallback(() => {
    setIngredients((prev) => [...prev, { ingredient: "" }]);
  }, []);

  const removeIngredient = useCallback((index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateIngredient = useCallback((index: number, field: keyof Ingredient, value: string) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    );
  }, []);

  const addInstruction = useCallback(() => {
    setInstructions((prev) => [
      ...prev,
      { step: prev.length + 1, description: "" },
    ]);
  }, []);

  const removeInstruction = useCallback((index: number) => {
    setInstructions((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((inst, i) => ({ ...inst, step: i + 1 }))
    );
  }, []);

  const updateInstruction = useCallback((index: number, description: string) => {
    setInstructions((prev) =>
      prev.map((inst, i) => (i === index ? { ...inst, description } : inst))
    );
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);

      const data = {
        name,
        description,
        ingredients: ingredients.filter((i) => i.ingredient.trim()),
        instructions: instructions.filter((i) => i.description.trim()),
        prepTimeMinutes: prepTime || null,
        cookTimeMinutes: cookTime || null,
        servings: servings || null,
      };

      try {
        let response;
        if (recipeId) {
          response = await client.recipes[":id"].$put({
            param: { id: recipeId },
            json: data,
          });
        } else {
          response = await client.recipes.$post({
            json: data,
          });
        }

        if (!response.ok) {
          const err = await response.json();
          throw new Error("error" in err ? err.error : "Failed to save recipe");
        }

        const result = await response.json();
        window.location.href = `/recipes/${result.id}`;
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setSaving(false);
      }
    },
    [name, description, ingredients, instructions, prepTime, cookTime, servings, recipeId]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Recipe Name</label>
        <input
          type="text"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <textarea
          value={description}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border rounded-md min-h-[100px]"
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Ingredients</label>
          <button
            type="button"
            onClick={addIngredient}
            className="text-sm text-primary hover:underline"
          >
            + Add Ingredient
          </button>
        </div>
        {ingredients.map((ing, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              placeholder="Amount"
              value={ing.amount || ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                updateIngredient(index, "amount", e.target.value)
              }
              className="w-20 px-2 py-1 border rounded-md text-sm"
            />
            <input
              type="text"
              placeholder="Unit"
              value={ing.unit || ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                updateIngredient(index, "unit", e.target.value)
              }
              className="w-24 px-2 py-1 border rounded-md text-sm"
            />
            <input
              type="text"
              placeholder="Ingredient"
              value={ing.ingredient}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                updateIngredient(index, "ingredient", e.target.value)
              }
              className="flex-1 px-2 py-1 border rounded-md text-sm"
              required
            />
            <button
              type="button"
              onClick={() => removeIngredient(index)}
              className="text-muted-foreground hover:text-destructive"
              disabled={ingredients.length <= 1}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Instructions</label>
          <button
            type="button"
            onClick={addInstruction}
            className="text-sm text-primary hover:underline"
          >
            + Add Step
          </button>
        </div>
        {instructions.map((inst, index) => (
          <div key={index} className="flex gap-2">
            <span className="w-8 h-8 flex items-center justify-center bg-muted rounded-full text-sm font-medium">
              {inst.step}
            </span>
            <textarea
              placeholder={`Step ${inst.step}`}
              value={inst.description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateInstruction(index, e.target.value)
              }
              className="flex-1 px-2 py-1 border rounded-md text-sm min-h-[60px]"
              required
            />
            <button
              type="button"
              onClick={() => removeInstruction(index)}
              className="text-muted-foreground hover:text-destructive self-start mt-2"
              disabled={instructions.length <= 1}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Prep Time (min)</label>
          <input
            type="number"
            value={prepTime}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPrepTime(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border rounded-md"
            min="0"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Cook Time (min)</label>
          <input
            type="number"
            value={cookTime}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCookTime(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border rounded-md"
            min="0"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Servings</label>
          <input
            type="number"
            value={servings}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setServings(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border rounded-md"
            min="1"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Saving..." : recipeId ? "Update Recipe" : "Create Recipe"}
      </button>
    </form>
  );
}

// Initialize when DOM is ready
function init() {
  const root = document.getElementById("recipe-form-root");
  if (!root) return;

  const initialData = root.dataset.initial;
  const recipeId = root.dataset.recipeId;

  try {
    const data = initialData ? JSON.parse(initialData) : undefined;
    createRoot(root).render(<RecipeForm recipeId={recipeId} initialData={data} />);
  } catch (error) {
    console.error("Failed to initialize recipe form:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { RecipeForm };

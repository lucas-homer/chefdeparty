import React, { useState, useEffect } from "react";
import type { UserRecipe } from "./types";

interface RecipePickerProps {
  onSelectRecipe: (recipe: UserRecipe) => void;
  selectedRecipeIds?: string[];
}

export function RecipePicker({ onSelectRecipe, selectedRecipeIds = [] }: RecipePickerProps) {
  const [recipes, setRecipes] = useState<UserRecipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchRecipes() {
      try {
        const response = await fetch("/api/recipes");
        if (response.ok) {
          const data = await response.json();
          setRecipes(data);
        }
      } catch (error) {
        console.error("Failed to fetch recipes:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRecipes();
  }, []);

  const filteredRecipes = recipes.filter(
    (recipe) =>
      recipe.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm">Loading your recipes...</span>
        </div>
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="p-4 bg-muted/30 rounded-lg">
        <p className="text-sm text-muted-foreground">
          No recipes in your library yet. You can import from a URL, upload an image, or describe
          a dish in the chat!
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          <span className="font-medium">Your Recipe Library</span>
          <span className="text-sm text-muted-foreground">({recipes.length} recipes)</span>
        </div>
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-3 border-t">
          {/* Search */}
          <div className="relative mb-3">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search recipes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Recipe grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
            {filteredRecipes.map((recipe) => {
              const isSelected = selectedRecipeIds.includes(recipe.id);
              return (
                <button
                  key={recipe.id}
                  onClick={() => onSelectRecipe(recipe)}
                  disabled={isSelected}
                  className={`
                    p-3 text-left rounded-md border transition-colors
                    ${
                      isSelected
                        ? "bg-primary/10 border-primary text-primary cursor-not-allowed"
                        : "hover:bg-muted hover:border-primary/50"
                    }
                  `}
                >
                  <p className="font-medium text-sm line-clamp-2">{recipe.name}</p>
                  {recipe.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {recipe.description}
                    </p>
                  )}
                  {isSelected && (
                    <span className="inline-flex items-center gap-1 text-xs mt-1 text-primary">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Added
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {filteredRecipes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recipes match your search
            </p>
          )}
        </div>
      )}
    </div>
  );
}

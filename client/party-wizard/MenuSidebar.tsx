import React from "react";
import type { MenuPlanData } from "./types";

interface MenuSidebarProps {
  menuPlan: MenuPlanData | null;
  onRemoveRecipe: (index: number, isNew: boolean) => void;
}

export function MenuSidebar({ menuPlan, onRemoveRecipe }: MenuSidebarProps) {
  const existingRecipes = menuPlan?.existingRecipes || [];
  const newRecipes = menuPlan?.newRecipes || [];
  const totalCount = existingRecipes.length + newRecipes.length;

  // Get icon for recipe source type
  function getSourceIcon(sourceType?: string): string {
    switch (sourceType) {
      case "photo":
        return "📷";
      case "url":
        return "🔗";
      case "ai":
        return "✨";
      default:
        return "📚";
    }
  }

  return (
    <div className="flex flex-col h-full border-l bg-muted/20">
      {/* Header */}
      <div className="p-3 border-b">
        <h3 className="font-medium text-sm">
          Menu ({totalCount})
        </h3>
      </div>

      {/* Recipe list */}
      <div className="flex-1 overflow-y-auto">
        {totalCount === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <p className="mb-2">No recipes yet</p>
            <p className="text-xs">
              Add recipes by pasting URLs, uploading photos, or describing dishes.
            </p>
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            {/* Library recipes */}
            {existingRecipes.map((recipe, index) => (
              <li
                key={`existing-${recipe.recipeId}`}
                className="group flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 text-sm"
              >
                <span className="flex-shrink-0" title="From library">
                  📚
                </span>
                <span className="flex-1 truncate">{recipe.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveRecipe(index, false)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  title="Remove from menu"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </li>
            ))}

            {/* New recipes (imported/generated) */}
            {newRecipes.map((recipe, index) => (
              <li
                key={`new-${index}-${recipe.name}`}
                className="group flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 text-sm"
              >
                <span className="flex-shrink-0" title={`Source: ${recipe.sourceType || "unknown"}`}>
                  {getSourceIcon(recipe.sourceType)}
                </span>
                <span className="flex-1 truncate">{recipe.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveRecipe(index, true)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  title="Remove from menu"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer with legend */}
      {totalCount > 0 && (
        <div className="p-3 border-t text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>📚 library</span>
            <span>📷 photo</span>
            <span>🔗 URL</span>
            <span>✨ AI</span>
          </div>
        </div>
      )}
    </div>
  );
}

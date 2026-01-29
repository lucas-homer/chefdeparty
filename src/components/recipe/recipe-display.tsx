/**
 * @deprecated NEXT.JS LEGACY CODE - Do not use
 * This component was used to display recipe details in the Next.js App Router.
 * Uses next/link which is not compatible with the current Hono setup.
 * Kept for reference - shows a good recipe display layout using shadcn-ui
 * components (Card, Badge, Button) that could be adapted.
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Users,
  Edit,
  Share2,
  Link as LinkIcon,
  Camera,
  Sparkles,
  FileText,
} from "lucide-react";
import type { Recipe, Ingredient, Instruction, DietaryTag } from "../../../drizzle/schema";

interface RecipeDisplayProps {
  recipe: Recipe;
  backLink: {
    href: string;
    label: string;
  };
  showEditButton?: boolean;
}

const sourceLabels = {
  manual: { label: "Manual entry", icon: FileText },
  url: { label: "Imported from URL", icon: LinkIcon },
  photo: { label: "Scanned from photo", icon: Camera },
  ai: { label: "AI generated", icon: Sparkles },
};

export function RecipeDisplay({
  recipe,
  backLink,
  showEditButton = true,
}: RecipeDisplayProps) {
  const source = recipe.sourceType
    ? sourceLabels[recipe.sourceType as keyof typeof sourceLabels]
    : null;
  const SourceIcon = source?.icon || FileText;

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{recipe.name}</h1>
          {recipe.description && (
            <p className="mt-2 text-muted-foreground">{recipe.description}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {(recipe.prepTimeMinutes || recipe.cookTimeMinutes) && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {recipe.prepTimeMinutes && `${recipe.prepTimeMinutes}m prep`}
                {recipe.prepTimeMinutes && recipe.cookTimeMinutes && " + "}
                {recipe.cookTimeMinutes && `${recipe.cookTimeMinutes}m cook`}
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {recipe.servings} servings
              </span>
            )}
            {source && (
              <span className="flex items-center gap-1">
                <SourceIcon className="h-4 w-4" />
                {source.label}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          {showEditButton && (
            <Link href={`/recipes/${recipe.id}/edit`}>
              <Button variant="outline" size="sm">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Dietary Tags */}
      {recipe.dietaryTags && recipe.dietaryTags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {recipe.dietaryTags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Ingredients */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Ingredients</CardTitle>
            {recipe.servings && (
              <CardDescription>For {recipe.servings} servings</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recipe.ingredients.map((ing, index) => (
                <li key={index} className="flex gap-2 text-sm">
                  <span className="font-medium">
                    {ing.amount} {ing.unit}
                  </span>
                  <span>{ing.ingredient}</span>
                  {ing.notes && (
                    <span className="text-muted-foreground">({ing.notes})</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {recipe.instructions.map((inst, index) => (
                <li key={index} className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                    {inst.step}
                  </div>
                  <p className="pt-1 text-sm">{inst.description}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Source URL if imported */}
      {recipe.sourceUrl && (
        <div className="mt-6 text-sm text-muted-foreground">
          Source:{" "}
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            {recipe.sourceUrl}
          </a>
        </div>
      )}

      {/* Original recipe link if this is a copy */}
      {recipe.copiedFromId && (
        <div className="mt-4 text-sm text-muted-foreground">
          <Link
            href={`/recipes/${recipe.copiedFromId}`}
            className="underline hover:text-foreground"
          >
            View original recipe
          </Link>
        </div>
      )}
    </>
  );
}

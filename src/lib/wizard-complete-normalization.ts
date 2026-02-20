const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) return fallback;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : fallback;
}

function toOptionalPositiveInt(value: unknown): number | undefined {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) return undefined;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : undefined;
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) return fallback;
  const rounded = Math.round(parsed);
  return rounded >= 0 ? rounded : fallback;
}

function normalizeScheduledTime(value: unknown): string {
  const raw = normalizeOptionalString(value);
  if (!raw) return "09:00";

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!match) return "09:00";

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "00");
  const meridiem = match[3]?.toLowerCase();

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return "09:00";
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) return "09:00";
    if (hours === 12) hours = 0;
    if (meridiem === "pm") hours += 12;
  } else if (hours < 0 || hours > 23) {
    return "09:00";
  }

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function normalizeGuest(guest: unknown): Record<string, unknown> | null {
  if (!isRecord(guest)) return null;

  const name = normalizeOptionalString(guest.name);
  const email = normalizeOptionalString(guest.email);
  const phone = normalizeOptionalString(guest.phone);

  if (!name && !email && !phone) {
    return null;
  }

  return {
    name,
    email,
    phone,
  };
}

function normalizeMenuItem(item: unknown): Record<string, unknown> | null {
  if (!isRecord(item)) return null;
  return {
    recipeId: item.recipeId,
    name: item.name,
    course: item.course,
    scaledServings: toOptionalPositiveInt(item.scaledServings),
  };
}

function normalizeNewRecipe(recipe: unknown): Record<string, unknown> | null {
  if (!isRecord(recipe)) return null;
  return {
    name: recipe.name,
    description: recipe.description,
    sourceUrl: recipe.sourceUrl,
    sourceType: recipe.sourceType,
    imageHash: recipe.imageHash,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    prepTimeMinutes: toOptionalPositiveInt(recipe.prepTimeMinutes),
    cookTimeMinutes: toOptionalPositiveInt(recipe.cookTimeMinutes),
    servings: toOptionalPositiveInt(recipe.servings),
    tags: Array.isArray(recipe.tags) ? recipe.tags : undefined,
    dietaryTags: Array.isArray(recipe.dietaryTags) ? recipe.dietaryTags : undefined,
    course: recipe.course,
  };
}

function normalizeTimelineTask(task: unknown): Record<string, unknown> | null {
  if (!isRecord(task)) return null;

  const rawRecipeId = normalizeOptionalString(task.recipeId);

  return {
    recipeId: rawRecipeId && UUID_REGEX.test(rawRecipeId) ? rawRecipeId : null,
    recipeName: normalizeOptionalString(task.recipeName),
    description: task.description,
    daysBeforeParty: toNonNegativeInt(task.daysBeforeParty, 0),
    scheduledTime: normalizeScheduledTime(task.scheduledTime),
    durationMinutes: toPositiveInt(task.durationMinutes, 30),
    isPhaseStart: Boolean(task.isPhaseStart),
    phaseDescription: normalizeOptionalString(task.phaseDescription),
  };
}

export function normalizeWizardCompletePayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const guestList = Array.isArray(payload.guestList)
    ? payload.guestList
      .map(normalizeGuest)
      .filter((guest): guest is Record<string, unknown> => guest !== null)
    : [];

  const menuPlanInput = isRecord(payload.menuPlan) ? payload.menuPlan : {};
  const existingRecipes = Array.isArray(menuPlanInput.existingRecipes)
    ? menuPlanInput.existingRecipes
      .map(normalizeMenuItem)
      .filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const newRecipes = Array.isArray(menuPlanInput.newRecipes)
    ? menuPlanInput.newRecipes
      .map(normalizeNewRecipe)
      .filter((item): item is Record<string, unknown> => item !== null)
    : [];

  const timeline = Array.isArray(payload.timeline)
    ? payload.timeline
      .map(normalizeTimelineTask)
      .filter((task): task is Record<string, unknown> => task !== null)
    : [];

  return {
    sessionId: payload.sessionId,
    partyInfo: payload.partyInfo,
    guestList,
    menuPlan: {
      existingRecipes,
      newRecipes,
      dietaryRestrictions: Array.isArray(menuPlanInput.dietaryRestrictions)
        ? menuPlanInput.dietaryRestrictions
        : undefined,
      ambitionLevel: menuPlanInput.ambitionLevel,
      processedUrls: Array.isArray(menuPlanInput.processedUrls)
        ? menuPlanInput.processedUrls
        : undefined,
      processedImageHashes: Array.isArray(menuPlanInput.processedImageHashes)
        ? menuPlanInput.processedImageHashes
        : undefined,
    },
    timeline,
  };
}

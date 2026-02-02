/**
 * Serialization layer for wizard sessions.
 * Converts between runtime types (from wizard-schemas.ts) and DB types (from schema.ts).
 *
 * The main difference is Date handling:
 * - Runtime: partyInfo.dateTime is a Date object
 * - DB/JSON: partyInfo.dateTime is an ISO string
 */

import type {
  PartyInfoData,
  GuestData,
  MenuPlanData,
  TimelineTaskData,
} from "./wizard-schemas";
import type {
  SerializedPartyInfo,
  SerializedGuestData,
  SerializedMenuPlan,
  SerializedTimelineTask,
  WizardSession,
} from "../../drizzle/schema";

// ============================================
// Serialization (Runtime -> DB)
// ============================================

export function serializePartyInfo(data: PartyInfoData): SerializedPartyInfo {
  return {
    name: data.name,
    dateTime: data.dateTime instanceof Date
      ? data.dateTime.toISOString()
      : data.dateTime,
    location: data.location,
    description: data.description,
    allowContributions: data.allowContributions,
  };
}

export function serializeGuestList(guests: GuestData[]): SerializedGuestData[] {
  return guests.map((g) => ({
    name: g.name,
    email: g.email,
    phone: g.phone,
  }));
}

export function serializeMenuPlan(plan: MenuPlanData): SerializedMenuPlan {
  return {
    existingRecipes: plan.existingRecipes.map((r) => ({
      recipeId: r.recipeId,
      name: r.name,
      course: r.course,
      scaledServings: r.scaledServings,
    })),
    newRecipes: plan.newRecipes.map((r) => ({
      name: r.name,
      description: r.description,
      sourceUrl: r.sourceUrl,
      sourceType: r.sourceType,
      ingredients: r.ingredients,
      instructions: r.instructions,
      prepTimeMinutes: r.prepTimeMinutes,
      cookTimeMinutes: r.cookTimeMinutes,
      servings: r.servings,
      tags: r.tags,
      dietaryTags: r.dietaryTags,
      course: r.course,
    })),
    dietaryRestrictions: plan.dietaryRestrictions,
    ambitionLevel: plan.ambitionLevel,
    processedUrls: plan.processedUrls,
    processedImageHashes: plan.processedImageHashes,
  };
}

export function serializeTimeline(tasks: TimelineTaskData[]): SerializedTimelineTask[] {
  return tasks.map((t) => ({
    recipeId: t.recipeId,
    recipeName: t.recipeName,
    description: t.description,
    daysBeforeParty: t.daysBeforeParty,
    scheduledTime: t.scheduledTime,
    durationMinutes: t.durationMinutes,
    isPhaseStart: t.isPhaseStart,
    phaseDescription: t.phaseDescription,
  }));
}

// ============================================
// Deserialization (DB -> Runtime)
// ============================================

export function deserializePartyInfo(data: SerializedPartyInfo | null): PartyInfoData | null {
  if (!data) return null;
  return {
    name: data.name,
    dateTime: new Date(data.dateTime),
    location: data.location,
    description: data.description,
    allowContributions: data.allowContributions ?? false,
  };
}

export function deserializeGuestList(guests: SerializedGuestData[] | null): GuestData[] {
  if (!guests) return [];
  return guests.map((g) => ({
    name: g.name,
    email: g.email,
    phone: g.phone,
  }));
}

export function deserializeMenuPlan(plan: SerializedMenuPlan | null): MenuPlanData | null {
  if (!plan) return null;
  return {
    existingRecipes: plan.existingRecipes.map((r) => ({
      recipeId: r.recipeId,
      name: r.name,
      course: r.course as MenuPlanData["existingRecipes"][0]["course"],
      scaledServings: r.scaledServings,
    })),
    newRecipes: plan.newRecipes.map((r) => ({
      name: r.name,
      description: r.description,
      sourceUrl: r.sourceUrl,
      sourceType: r.sourceType as MenuPlanData["newRecipes"][0]["sourceType"],
      ingredients: r.ingredients as MenuPlanData["newRecipes"][0]["ingredients"],
      instructions: r.instructions as MenuPlanData["newRecipes"][0]["instructions"],
      prepTimeMinutes: r.prepTimeMinutes,
      cookTimeMinutes: r.cookTimeMinutes,
      servings: r.servings,
      tags: r.tags,
      dietaryTags: r.dietaryTags as MenuPlanData["newRecipes"][0]["dietaryTags"],
      course: r.course as MenuPlanData["newRecipes"][0]["course"],
    })),
    dietaryRestrictions: plan.dietaryRestrictions,
    ambitionLevel: plan.ambitionLevel as MenuPlanData["ambitionLevel"],
    processedUrls: plan.processedUrls,
    processedImageHashes: plan.processedImageHashes,
  };
}

export function deserializeTimeline(tasks: SerializedTimelineTask[] | null): TimelineTaskData[] | null {
  if (!tasks) return null;
  return tasks.map((t) => ({
    recipeId: t.recipeId,
    recipeName: t.recipeName,
    description: t.description,
    daysBeforeParty: t.daysBeforeParty,
    scheduledTime: t.scheduledTime,
    durationMinutes: t.durationMinutes,
    isPhaseStart: t.isPhaseStart ?? false,
    phaseDescription: t.phaseDescription,
  }));
}

// ============================================
// Full Session Conversion
// ============================================

export interface DeserializedWizardSession {
  id: string;
  userId: string;
  currentStep: "party-info" | "guests" | "menu" | "timeline";
  furthestStepIndex: number; // 0 = party-info, 1 = guests, 2 = menu, 3 = timeline
  partyInfo: PartyInfoData | null;
  guestList: GuestData[];
  menuPlan: MenuPlanData | null;
  timeline: TimelineTaskData[] | null;
  status: "active" | "completed" | "abandoned";
  partyId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export function deserializeWizardSession(row: WizardSession): DeserializedWizardSession {
  return {
    id: row.id,
    userId: row.userId,
    currentStep: row.currentStep as DeserializedWizardSession["currentStep"],
    furthestStepIndex: row.furthestStepIndex ?? 0,
    partyInfo: deserializePartyInfo(row.partyInfo),
    guestList: deserializeGuestList(row.guestList),
    menuPlan: deserializeMenuPlan(row.menuPlan),
    timeline: deserializeTimeline(row.timeline),
    status: row.status as DeserializedWizardSession["status"],
    partyId: row.partyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

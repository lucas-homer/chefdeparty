import { and, eq } from "drizzle-orm";
import { wizardSessions } from "../../../drizzle/schema";
import type { createDb } from "../db";
import type {
  WizardStep,
  WizardState,
  TimelineTaskData,
  PartyInfoData,
  GuestData,
  MenuPlanData,
} from "../wizard-schemas";
import {
  serializeGuestList,
  serializeMenuPlan,
  serializePartyInfo,
  serializeTimeline,
} from "../wizard-session-serialization";

export interface WizardActionContext {
  db: ReturnType<typeof createDb>;
  userId: string;
  sessionId?: string;
  currentData: Partial<WizardState>;
}

export function cleanOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function updateSessionState(
  context: WizardActionContext,
  updates: {
    currentStep?: WizardStep;
    partyInfo?: PartyInfoData | null;
    guestList?: GuestData[];
    menuPlan?: MenuPlanData | null;
    timeline?: TimelineTaskData[] | null;
  }
): Promise<void> {
  if (!context.sessionId) return;

  const serializedUpdates: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.currentStep !== undefined) {
    serializedUpdates.currentStep = updates.currentStep;
  }
  if (updates.partyInfo !== undefined) {
    serializedUpdates.partyInfo = updates.partyInfo ? serializePartyInfo(updates.partyInfo) : null;
  }
  if (updates.guestList !== undefined) {
    serializedUpdates.guestList = serializeGuestList(updates.guestList);
  }
  if (updates.menuPlan !== undefined) {
    serializedUpdates.menuPlan = updates.menuPlan ? serializeMenuPlan(updates.menuPlan) : null;
  }
  if (updates.timeline !== undefined) {
    serializedUpdates.timeline = updates.timeline ? serializeTimeline(updates.timeline) : null;
  }

  await context.db
    .update(wizardSessions)
    .set(serializedUpdates)
    .where(
      and(
        eq(wizardSessions.id, context.sessionId),
        eq(wizardSessions.userId, context.userId)
      )
    );
}

import type { WizardStep } from "./wizard-schemas";
import type { SerializedUIMessage } from "../../drizzle/schema";

const introText: Record<WizardStep, string> = {
  "party-info":
    "Let's plan your party! Tell me about your event - what's the occasion, when is it, and where?",
  guests:
    "Who's coming? Add your guests with their email or phone. You can always add more later.",
  menu:
    "What's on the menu? Pick recipes from your library, paste a URL, upload an image, or describe a dish.",
  timeline:
    "Let's create your cooking timeline! I'll create a cooking schedule based on your menu. We'll work backwards from party time.",
};

export function getStepIntroMessage(step: WizardStep): SerializedUIMessage {
  const content = introText[step];
  return {
    id: `intro-${step}`,
    role: "assistant",
    content,
    parts: [{ type: "text", text: content }],
  };
}

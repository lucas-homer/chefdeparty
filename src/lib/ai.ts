import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Create a Google AI provider with the API key from environment
export function createAI(apiKey: string) {
  const google = createGoogleGenerativeAI({ apiKey });

  return {
    defaultModel: google("gemini-2.5-flash"),
    visionModel: google("gemini-2.5-flash"),
    fastModel: google("gemini-2.5-flash"),
  };
}

// For backwards compatibility - these will fail without API key in Workers
// Use createAI(c.env.GOOGLE_GENERATIVE_AI_API_KEY) instead
import { google } from "@ai-sdk/google";
export const defaultModel = google("gemini-2.5-flash");
export const visionModel = google("gemini-2.5-flash");
export const fastModel = google("gemini-2.5-flash");

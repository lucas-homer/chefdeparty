import { http, HttpResponse } from "msw";

// Mock recipe data for AI extraction tests
const mockExtractedRecipe = {
  name: "Mock Extracted Recipe",
  description: "A delicious mock recipe for testing",
  ingredients: [
    { amount: "2", unit: "cups", ingredient: "flour" },
    { amount: "1", unit: "cup", ingredient: "sugar" },
    { amount: "3", ingredient: "eggs" },
  ],
  instructions: [
    { step: 1, description: "Mix dry ingredients" },
    { step: 2, description: "Add wet ingredients" },
    { step: 3, description: "Bake at 350°F for 30 minutes" },
  ],
  prepTimeMinutes: 15,
  cookTimeMinutes: 30,
  servings: 8,
  tags: ["dessert", "baking"],
  dietaryTags: [],
};

// Mock timeline tasks for AI generation tests
const mockTimelineTasks = {
  tasks: [
    {
      recipeId: null,
      description: "Set up kitchen workspace",
      daysBeforeParty: 0,
      scheduledTime: "14:00",
      durationMinutes: 15,
      sortOrder: 1,
      isPhaseStart: true,
      phaseDescription: "Begin cooking preparation",
    },
    {
      recipeId: "test-recipe-1",
      description: "Prep ingredients",
      daysBeforeParty: 0,
      scheduledTime: "14:30",
      durationMinutes: 20,
      sortOrder: 2,
      isPhaseStart: false,
      phaseDescription: null,
    },
  ],
};

export const handlers = [
  // Resend API - Email sending
  http.post("https://api.resend.com/emails", async () => {
    return HttpResponse.json(
      {
        id: "mock-email-id-123",
        from: "ChefDeParty <noreply@chefde.party>",
        to: ["test@example.com"],
        created_at: new Date().toISOString(),
      },
      { status: 200 }
    );
  }),

  // Tavily API - URL content extraction
  http.post("https://api.tavily.com/extract", async ({ request }) => {
    const body = (await request.json()) as { urls: string[] };
    const url = body.urls[0] || "https://example.com/recipe";

    return HttpResponse.json({
      results: [
        {
          url,
          raw_content: `
            <h1>Chocolate Chip Cookies</h1>
            <p>Delicious homemade cookies</p>
            <h2>Ingredients</h2>
            <ul>
              <li>2 cups flour</li>
              <li>1 cup sugar</li>
              <li>1 cup chocolate chips</li>
            </ul>
            <h2>Instructions</h2>
            <ol>
              <li>Mix ingredients</li>
              <li>Bake at 375°F for 12 minutes</li>
            </ol>
          `,
          content:
            "Chocolate Chip Cookies - Delicious homemade cookies. Ingredients: 2 cups flour, 1 cup sugar, 1 cup chocolate chips. Instructions: Mix ingredients, bake at 375°F for 12 minutes.",
        },
      ],
    });
  }),

  // Google Generative AI API - Mock for generateObject calls
  // This handles the AI SDK's requests to Google's API
  http.post(
    "https://generativelanguage.googleapis.com/v1beta/models/*",
    async ({ request }) => {
      const body = (await request.json()) as {
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
      };

      // Check if this is a recipe extraction request
      const prompt = body.contents?.[0]?.parts?.[0]?.text || "";

      if (
        prompt.includes("Extract the recipe") ||
        prompt.includes("recipe from this")
      ) {
        // Return a response that mimics Google AI's generateObject format
        return HttpResponse.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(mockExtractedRecipe),
                  },
                ],
                role: "model",
              },
              finishReason: "STOP",
            },
          ],
        });
      }

      if (
        prompt.includes("cooking timeline") ||
        prompt.includes("dinner party")
      ) {
        return HttpResponse.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(mockTimelineTasks),
                  },
                ],
                role: "model",
              },
              finishReason: "STOP",
            },
          ],
        });
      }

      // Default response for other AI calls
      return HttpResponse.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "Mock AI response for testing",
                },
              ],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
      });
    }
  ),

  // Google OAuth token endpoint (for calendar integration tests)
  http.post("https://oauth2.googleapis.com/token", async () => {
    return HttpResponse.json({
      access_token: "mock-access-token",
      refresh_token: "mock-refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/calendar",
    });
  }),

  // Google Calendar API (for calendar sync tests)
  http.post(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    async () => {
      return HttpResponse.json({
        id: "mock-calendar-event-id",
        status: "confirmed",
        htmlLink: "https://calendar.google.com/event?eid=mock",
        created: new Date().toISOString(),
      });
    }
  ),

  http.patch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events/:eventId",
    async () => {
      return HttpResponse.json({
        id: "mock-calendar-event-id",
        status: "confirmed",
        htmlLink: "https://calendar.google.com/event?eid=mock",
        updated: new Date().toISOString(),
      });
    }
  ),

  http.delete(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events/:eventId",
    async () => {
      return new HttpResponse(null, { status: 204 });
    }
  ),
];

// Export mock data for use in tests
export const mockData = {
  extractedRecipe: mockExtractedRecipe,
  timelineTasks: mockTimelineTasks,
};

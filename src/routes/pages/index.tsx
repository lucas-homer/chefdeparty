import { Hono } from "hono";
import { reactRenderer } from "@hono/react-renderer";
import { eq, and, desc, asc, isNull } from "drizzle-orm";
import {
  parties,
  recipes,
  partyMenu,
  guests,
  timelineTasks,
  contributionItems,
  calendarConnections,
  inviteCodes,
  inviteCodeUses,
  users,
} from "../../../drizzle/schema";
import { requireAuth, getUser } from "../../lib/hono-auth";
import { isAdmin } from "../../lib/admin";
import { Env } from "../../index";
import { createDb } from "../../lib/db";
import { Layout, PublicLayout } from "./layout";

type Variables = {
  db: ReturnType<typeof createDb>;
};

const pageRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Set up React renderer middleware
pageRoutes.use(
  "*",
  reactRenderer(({ children }) => <>{children}</>, {
    docType: true,
  })
);

// ==================== PARTIES PAGES ====================

// GET /parties - List all parties
pageRoutes.get("/parties", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const db = c.get("db");
  const userParties = await db
    .select()
    .from(parties)
    .where(eq(parties.hostId, user.id))
    .orderBy(desc(parties.dateTime));

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return c.render(
    <Layout title="Your Parties - ChefDeParty" user={user}>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Your Parties</h1>
        <a
          href="/parties/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          New Party
        </a>
      </div>

      {userParties.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            You haven't created any parties yet.
          </p>
          <a
            href="/parties/new"
            className="text-primary hover:underline"
          >
            Create your first party
          </a>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {userParties.map((party) => (
            <a
              key={party.id}
              href={`/parties/${party.id}`}
              className="block p-6 border rounded-lg hover:border-primary transition-colors"
            >
              <h2 className="font-semibold text-lg">{party.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {formatDate(party.dateTime)}
              </p>
              {party.location && (
                <p className="text-sm text-muted-foreground mt-1">
                  {party.location}
                </p>
              )}
              {party.description && (
                <p className="text-sm mt-2 line-clamp-2">{party.description}</p>
              )}
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
});

// GET /parties/new - Create party form
pageRoutes.get("/parties/new", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  return c.render(
    <Layout title="New Party - ChefDeParty" user={user}>
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Create New Party</h1>
        <form action="/api/parties" method="POST" className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Party Name</label>
            <input
              type="text"
              name="name"
              required
              className="w-full px-3 py-2 border rounded-md"
              placeholder="My Dinner Party"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date & Time</label>
            <input
              type="datetime-local"
              name="dateTime"
              required
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Location</label>
            <input
              type="text"
              name="location"
              className="w-full px-3 py-2 border rounded-md"
              placeholder="123 Main St"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              className="w-full px-3 py-2 border rounded-md min-h-[100px]"
              placeholder="What's the occasion?"
            />
          </div>
          <div className="flex gap-4">
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Create Party
            </button>
            <a href="/parties" className="px-4 py-2 border rounded-md hover:bg-muted">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </Layout>
  );
});

// GET /parties/:id - Party detail page
pageRoutes.get("/parties/:id", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const partyId = c.req.param("id");
  const db = c.get("db");

  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.hostId, user.id)));

  if (!party) {
    return c.render(
      <Layout title="Party Not Found - ChefDeParty" user={user}>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Party Not Found</h1>
          <a href="/parties" className="text-primary hover:underline">
            Back to parties
          </a>
        </div>
      </Layout>,
      { status: 404 }
    );
  }

  const baseUrl = c.env.NEXT_PUBLIC_URL || "https://chefde.party";
  const shareUrl = `${baseUrl}/invite/${party.shareToken}`;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return c.render(
    <Layout title={`${party.name} - ChefDeParty`} user={user} scripts={["/assets/share-link.js"]}>
      <div className="mb-6">
        <a href="/parties" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to parties
        </a>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{party.name}</h1>
          <p className="text-muted-foreground mt-1">{formatDate(party.dateTime)}</p>
          {party.location && (
            <p className="text-muted-foreground">{party.location}</p>
          )}
        </div>
        <a
          href={`/parties/${party.id}/edit`}
          className="px-4 py-2 border rounded-md hover:bg-muted"
        >
          Edit
        </a>
      </div>

      {party.description && (
        <p className="mb-8 text-muted-foreground">{party.description}</p>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <a
          href={`/parties/${party.id}/menu`}
          className="p-4 border rounded-lg hover:border-primary"
        >
          <h3 className="font-semibold">Menu</h3>
          <p className="text-sm text-muted-foreground">Select recipes</p>
        </a>
        <a
          href={`/parties/${party.id}/guests`}
          className="p-4 border rounded-lg hover:border-primary"
        >
          <h3 className="font-semibold">Guests</h3>
          <p className="text-sm text-muted-foreground">Manage invites</p>
        </a>
        <a
          href={`/parties/${party.id}/timeline`}
          className="p-4 border rounded-lg hover:border-primary"
        >
          <h3 className="font-semibold">Timeline</h3>
          <p className="text-sm text-muted-foreground">Cooking schedule</p>
        </a>
        <a
          href={`/parties/${party.id}/contributions`}
          className="p-4 border rounded-lg hover:border-primary"
        >
          <h3 className="font-semibold">Contributions</h3>
          <p className="text-sm text-muted-foreground">Potluck items</p>
        </a>
      </div>

      <div className="border rounded-lg p-4">
        <h3 className="font-medium mb-2">Share Link</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Share this link with guests so they can RSVP.
        </p>
        <div
          id="share-link-root"
          data-share-link-root
          data-share-url={shareUrl}
          data-title="Invite Link"
        />
      </div>
    </Layout>
  );
});

// GET /parties/:id/guests - Guests management page
pageRoutes.get("/parties/:id/guests", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const partyId = c.req.param("id");
  const db = c.get("db");

  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.hostId, user.id)));

  if (!party) {
    return c.notFound();
  }

  const guestList = await db
    .select()
    .from(guests)
    .where(eq(guests.partyId, partyId));

  return c.render(
    <Layout title={`Guests - ${party.name}`} user={user} scripts={["/assets/guest-dialog.js"]}>
      <div className="mb-6">
        <a href={`/parties/${partyId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to {party.name}
        </a>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Guests</h1>
        <div
          id="guest-dialog-root"
          data-party-id={partyId}
        />
      </div>

      {guestList.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">No guests yet. Add your first guest!</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {guestList.map((guest) => (
            <div key={guest.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{guest.name}</p>
                {guest.email && (
                  <p className="text-sm text-muted-foreground">{guest.email}</p>
                )}
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${
                guest.rsvpStatus === "attending" ? "bg-green-100 text-green-800" :
                guest.rsvpStatus === "declined" ? "bg-red-100 text-red-800" :
                "bg-gray-100 text-gray-800"
              }`}>
                {guest.rsvpStatus || "pending"}
              </span>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
});

// GET /parties/:id/menu - Menu management page
pageRoutes.get("/parties/:id/menu", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const partyId = c.req.param("id");
  const db = c.get("db");

  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.hostId, user.id)));

  if (!party) {
    return c.notFound();
  }

  // Get menu items with recipe details
  const menuItems = await db
    .select({
      id: partyMenu.id,
      recipeId: partyMenu.recipeId,
      recipeName: recipes.name,
      recipeDescription: recipes.description,
      scaledServings: partyMenu.scaledServings,
      course: partyMenu.course,
    })
    .from(partyMenu)
    .leftJoin(recipes, eq(partyMenu.recipeId, recipes.id))
    .where(eq(partyMenu.partyId, partyId));

  // Get all user recipes for adding to menu
  const userRecipes = await db
    .select()
    .from(recipes)
    .where(eq(recipes.ownerId, user.id));

  return c.render(
    <Layout title={`Menu - ${party.name}`} user={user}>
      <div className="mb-6">
        <a href={`/parties/${partyId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to {party.name}
        </a>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Menu</h1>
      </div>

      {/* Add to menu form */}
      <div className="border rounded-lg p-4 mb-6">
        <h3 className="font-medium mb-3">Add Recipe to Menu</h3>
        <form action={`/api/parties/${partyId}/menu`} method="POST" className="flex gap-4">
          <select name="recipeId" className="flex-1 border rounded-md px-3 py-2">
            <option value="">Select a recipe...</option>
            {userRecipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
            ))}
          </select>
          <input
            type="number"
            name="servings"
            placeholder="Servings"
            className="w-24 border rounded-md px-3 py-2"
            min="1"
          />
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
            Add
          </button>
        </form>
      </div>

      {menuItems.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">No recipes on the menu yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {menuItems.map((item) => (
            <div key={item.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{item.recipeName}</p>
                {item.recipeDescription && (
                  <p className="text-sm text-muted-foreground">{item.recipeDescription}</p>
                )}
                {item.scaledServings && (
                  <p className="text-xs text-muted-foreground">Serves {item.scaledServings}</p>
                )}
              </div>
              <form action={`/api/parties/${partyId}/menu/${item.id}`} method="POST">
                <input type="hidden" name="_method" value="DELETE" />
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
});

// GET /parties/:id/contributions - Contributions/potluck page
pageRoutes.get("/parties/:id/contributions", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const partyId = c.req.param("id");
  const db = c.get("db");

  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.hostId, user.id)));

  if (!party) {
    return c.notFound();
  }

  const contributions = await db
    .select()
    .from(contributionItems)
    .where(eq(contributionItems.partyId, partyId));

  return c.render(
    <Layout title={`Contributions - ${party.name}`} user={user}>
      <div className="mb-6">
        <a href={`/parties/${partyId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to {party.name}
        </a>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Contributions</h1>
      </div>

      {/* Add contribution form */}
      <div className="border rounded-lg p-4 mb-6">
        <h3 className="font-medium mb-3">Add Item for Guests to Bring</h3>
        <form action={`/api/parties/${partyId}/contributions`} method="POST" className="flex gap-4">
          <input
            type="text"
            name="name"
            placeholder="Item name (e.g., 'Bottle of wine')"
            className="flex-1 border rounded-md px-3 py-2"
            required
          />
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
            Add
          </button>
        </form>
      </div>

      {contributions.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">No contribution items yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {contributions.map((item) => (
            <div key={item.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{item.name}</p>
                {item.claimedBy && (
                  <p className="text-sm text-green-600">Claimed by: {item.claimedBy}</p>
                )}
              </div>
              <form action={`/api/parties/${partyId}/contributions/${item.id}`} method="POST">
                <input type="hidden" name="_method" value="DELETE" />
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
});

// GET /parties/:id/timeline - Timeline page with island
pageRoutes.get("/parties/:id/timeline", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const partyId = c.req.param("id");
  const db = c.get("db");
  const error = c.req.query("error");

  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.hostId, user.id)));

  if (!party) {
    return c.notFound();
  }

  const tasks = await db
    .select({
      id: timelineTasks.id,
      recipeId: timelineTasks.recipeId,
      description: timelineTasks.description,
      scheduledDate: timelineTasks.scheduledDate,
      scheduledTime: timelineTasks.scheduledTime,
      durationMinutes: timelineTasks.durationMinutes,
      completed: timelineTasks.completed,
      isPhaseStart: timelineTasks.isPhaseStart,
      phaseDescription: timelineTasks.phaseDescription,
      recipeName: recipes.name,
    })
    .from(timelineTasks)
    .leftJoin(recipes, eq(timelineTasks.recipeId, recipes.id))
    .where(eq(timelineTasks.partyId, partyId))
    .orderBy(asc(timelineTasks.scheduledDate), asc(timelineTasks.sortOrder));

  const tasksJson = JSON.stringify(tasks);

  return c.render(
    <Layout
      title={`Timeline - ${party.name} - ChefDeParty`}
      user={user}
      scripts={["/assets/timeline.js", "/assets/share-link.js"]}
    >
      <div className="mb-6">
        <a
          href={`/parties/${partyId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to {party.name}
        </a>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Cooking Timeline</h1>
        <form action={`/api/parties/${partyId}/timeline/generate`} method="POST">
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Generate Timeline
          </button>
        </form>
      </div>

      {error === "no-recipes" && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          No recipes in menu. <a href={`/parties/${partyId}/menu`} className="underline font-medium">Add recipes to your menu</a> before generating a timeline.
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            No timeline tasks yet. Add recipes to your menu first, then generate a timeline.
          </p>
          <a
            href={`/parties/${partyId}/menu`}
            className="text-primary hover:underline"
          >
            Go to menu
          </a>
        </div>
      ) : (
        <div
          id="timeline-root"
          data-party-id={partyId}
          data-initial={tasksJson}
        >
          {/* Server-rendered fallback for no-JS */}
          <div className="space-y-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-lg border ${task.completed ? "bg-muted/50" : "bg-card"}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-1 w-5 h-5 rounded-full border-2 ${
                      task.completed
                        ? "bg-primary border-primary"
                        : "border-muted-foreground"
                    }`}
                  />
                  <div>
                    {task.isPhaseStart && task.phaseDescription && (
                      <p className="text-xs font-medium text-primary mb-1">
                        {task.phaseDescription}
                      </p>
                    )}
                    <p className={task.completed ? "line-through text-muted-foreground" : ""}>
                      {task.description}
                    </p>
                    <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
                      {task.scheduledTime && <span>{task.scheduledTime}</span>}
                      {task.durationMinutes && <span>({task.durationMinutes} min)</span>}
                      {task.recipeName && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">
                          {task.recipeName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
});

// ==================== RECIPES PAGES ====================

// GET /recipes - List all recipes
pageRoutes.get("/recipes", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const db = c.get("db");
  const userRecipes = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.ownerId, user.id), isNull(recipes.copiedFromId)))
    .orderBy(desc(recipes.createdAt));

  return c.render(
    <Layout title="Your Recipes - ChefDeParty" user={user} scripts={["/assets/import-recipe.js"]}>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Your Recipes</h1>
        <div className="flex items-center gap-2">
          <div id="import-recipe-root" className="contents" />
          <a
            href="/recipes/generate"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm border rounded-md hover:bg-muted"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Generate with AI
          </a>
          <a
            href="/recipes/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            New Recipe
          </a>
        </div>
      </div>

      {userRecipes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            You haven't created any recipes yet.
          </p>
          <a href="/recipes/new" className="text-primary hover:underline">
            Create your first recipe
          </a>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {userRecipes.map((recipe) => (
            <a
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="block p-6 border rounded-lg hover:border-primary transition-colors"
            >
              <h2 className="font-semibold text-lg">{recipe.name}</h2>
              {recipe.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {recipe.description}
                </p>
              )}
              <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                {recipe.prepTimeMinutes && <span>Prep: {recipe.prepTimeMinutes}m</span>}
                {recipe.cookTimeMinutes && <span>Cook: {recipe.cookTimeMinutes}m</span>}
                {recipe.servings && <span>Serves {recipe.servings}</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
});

// GET /recipes/generate - Generate recipe with chat
pageRoutes.get("/recipes/generate", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  return c.render(
    <Layout
      title="Generate Recipe - ChefDeParty"
      user={user}
      scripts={["/assets/recipe-chat.js"]}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <a href="/recipes" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Back to recipes
          </a>
        </div>
        <h1 className="text-2xl font-bold mb-6">Generate Recipe with AI</h1>
        <p className="text-muted-foreground mb-6">
          Describe what you'd like to cook and I'll help you create a recipe. Tell me about ingredients you have, dietary preferences, skill level, or cuisine type.
        </p>
        <div id="recipe-chat-root" />
      </div>
    </Layout>
  );
});

// GET /recipes/new - Create recipe form with island
pageRoutes.get("/recipes/new", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  return c.render(
    <Layout
      title="New Recipe - ChefDeParty"
      user={user}
      scripts={["/assets/recipe-form.js"]}
    >
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Create New Recipe</h1>
        <div id="recipe-form-root" />
      </div>
    </Layout>
  );
});

// GET /recipes/:id - Recipe detail page
pageRoutes.get("/recipes/:id", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const recipeId = c.req.param("id");
  const db = c.get("db");

  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.ownerId, user.id)));

  if (!recipe) {
    return c.notFound();
  }

  return c.render(
    <Layout title={`${recipe.name} - ChefDeParty`} user={user}>
      <div className="mb-6">
        <a href="/recipes" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to recipes
        </a>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{recipe.name}</h1>
          {recipe.description && (
            <p className="text-muted-foreground mt-2">{recipe.description}</p>
          )}
        </div>
        <a
          href={`/recipes/${recipe.id}/edit`}
          className="px-4 py-2 border rounded-md hover:bg-muted"
        >
          Edit
        </a>
      </div>

      <div className="flex gap-6 mb-8 text-sm text-muted-foreground">
        {recipe.prepTimeMinutes && <span>Prep: {recipe.prepTimeMinutes} min</span>}
        {recipe.cookTimeMinutes && <span>Cook: {recipe.cookTimeMinutes} min</span>}
        {recipe.servings && <span>Serves {recipe.servings}</span>}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Ingredients</h2>
          <ul className="space-y-2">
            {(recipe.ingredients as any[]).map((ing: any, i: number) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">
                  {ing.amount} {ing.unit}
                </span>
                <span>{ing.ingredient}</span>
                {ing.notes && (
                  <span className="text-muted-foreground">({ing.notes})</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Instructions</h2>
          <ol className="space-y-4">
            {(recipe.instructions as any[]).map((inst: any) => (
              <li key={inst.step} className="flex gap-3">
                <span className="w-6 h-6 flex items-center justify-center bg-muted rounded-full text-sm font-medium">
                  {inst.step}
                </span>
                <p>{inst.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Layout>
  );
});

// GET /recipes/:id/edit - Edit recipe form with island
pageRoutes.get("/recipes/:id/edit", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const recipeId = c.req.param("id");
  const db = c.get("db");

  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.ownerId, user.id)));

  if (!recipe) {
    return c.notFound();
  }

  const recipeJson = JSON.stringify(recipe);

  return c.render(
    <Layout
      title={`Edit ${recipe.name} - ChefDeParty`}
      user={user}
      scripts={["/assets/recipe-form.js"]}
    >
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Edit Recipe</h1>
        <div id="recipe-form-root" data-recipe-id={recipe.id} data-initial={recipeJson} />
      </div>
    </Layout>
  );
});

// ==================== SETTINGS PAGE ====================

pageRoutes.get("/settings", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  const db = c.get("db");

  const [calendarConn] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, user.id));

  const hasCalendar = !!calendarConn;

  return c.render(
    <Layout
      title="Settings - ChefDeParty"
      user={user}
      scripts={["/assets/calendar-card.js"]}
    >
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      <div className="max-w-xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Calendar Integration</h2>
          <div
            id="calendar-card-root"
            data-connected={hasCalendar ? "true" : "false"}
            data-email={user.email || ""}
          />
        </div>
      </div>
    </Layout>
  );
});

// ==================== PUBLIC INVITE PAGE ====================

pageRoutes.get("/invite/:token", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  const [party] = await db
    .select({
      id: parties.id,
      name: parties.name,
      description: parties.description,
      dateTime: parties.dateTime,
      location: parties.location,
    })
    .from(parties)
    .where(eq(parties.shareToken, token));

  if (!party) {
    return c.render(
      <PublicLayout title="Invitation Not Found">
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Invitation Not Found</h1>
            <p className="text-muted-foreground">
              This invitation link may have expired or is invalid.
            </p>
          </div>
        </div>
      </PublicLayout>,
      { status: 404 }
    );
  }

  const contributions = await db
    .select()
    .from(contributionItems)
    .where(eq(contributionItems.partyId, party.id));

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return c.render(
    <PublicLayout title={`You're Invited - ${party.name}`}>
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold">You're Invited!</h1>
          </div>

          <div className="border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold">{party.name}</h2>
            <p className="text-muted-foreground mt-1">{formatDate(party.dateTime)}</p>
            {party.location && (
              <p className="text-muted-foreground">{party.location}</p>
            )}
            {party.description && (
              <p className="mt-4">{party.description}</p>
            )}
          </div>

          <form action={`/api/invite/${token}`} method="POST" className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Your Name *</label>
              <input
                type="text"
                name="name"
                required
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Your Email *</label>
              <input
                type="email"
                name="email"
                required
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Will you attend? *</label>
              <select name="rsvpStatus" required className="w-full px-3 py-2 border rounded-md">
                <option value="">Select...</option>
                <option value="yes">Yes, I'll be there!</option>
                <option value="maybe">Maybe</option>
                <option value="no">Sorry, can't make it</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">How many people?</label>
              <input
                type="number"
                name="headcount"
                min="1"
                max="10"
                defaultValue="1"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Dietary Restrictions</label>
              <input
                type="text"
                name="dietaryRestrictions"
                placeholder="e.g., vegetarian, gluten-free"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            {contributions.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Would you like to bring something?
                </label>
                <div className="space-y-2">
                  {contributions.map((item) => (
                    <label key={item.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="claimContributionIds"
                        value={item.id}
                        disabled={!!item.claimedByGuestId}
                        className="rounded"
                      />
                      <span className={item.claimedByGuestId ? "text-muted-foreground" : ""}>
                        {item.description}
                        {item.claimedByGuestId && " (claimed)"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Submit RSVP
            </button>
          </form>
        </div>
      </div>
    </PublicLayout>
  );
});

// ==================== ADMIN PAGE ====================

pageRoutes.get("/admin", requireAuth, async (c) => {
  const user = getUser(c);
  if (!user) return c.redirect("/login");

  // Check admin access
  if (!isAdmin(user.email, c.env.ADMIN_EMAILS)) {
    return c.render(
      <Layout title="Access Denied - ChefDeParty" user={user}>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access this page.
          </p>
        </div>
      </Layout>,
      { status: 403 }
    );
  }

  const db = c.get("db");

  // Get all invite codes with creator info and usage count
  const codes = await db
    .select({
      id: inviteCodes.id,
      code: inviteCodes.code,
      maxUses: inviteCodes.maxUses,
      usedCount: inviteCodes.usedCount,
      note: inviteCodes.note,
      expiresAt: inviteCodes.expiresAt,
      createdAt: inviteCodes.createdAt,
      createdByEmail: users.email,
    })
    .from(inviteCodes)
    .leftJoin(users, eq(inviteCodes.createdBy, users.id))
    .orderBy(desc(inviteCodes.createdAt));

  const formatDate = (date: Date | null) => {
    if (!date) return "Never";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return c.render(
    <Layout title="Admin - Invite Codes" user={user} scripts={["/assets/admin.js"]}>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Invite Codes</h1>
        <button
          id="generate-code-btn"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Generate New Code
        </button>
      </div>

      <div id="admin-message" className="mb-4"></div>

      {codes.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">No invite codes yet. Generate your first one!</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Code</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Uses</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Note</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Expires</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {codes.map((code) => {
                const isExpired = code.expiresAt && code.expiresAt < new Date();
                const isUsedUp = code.maxUses !== null && code.usedCount !== null && code.usedCount >= code.maxUses;
                const isInvalid = isExpired || isUsedUp;

                return (
                  <tr key={code.id} className={isInvalid ? "bg-muted/50 text-muted-foreground" : ""}>
                    <td className="px-4 py-3">
                      <code className="bg-muted px-2 py-1 rounded text-sm font-mono">{code.code}</code>
                      <button
                        className="copy-code-btn ml-2 text-xs text-muted-foreground hover:text-foreground"
                        data-code={code.code}
                        title="Copy to clipboard"
                      >
                        Copy
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {code.usedCount || 0} / {code.maxUses || "∞"}
                      {isUsedUp && <span className="ml-2 text-xs text-red-500">(used up)</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">{code.note || "-"}</td>
                    <td className="px-4 py-3 text-sm">{formatDate(code.createdAt)}</td>
                    <td className="px-4 py-3 text-sm">
                      {formatDate(code.expiresAt)}
                      {isExpired && <span className="ml-2 text-xs text-red-500">(expired)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="delete-code-btn text-sm text-red-600 hover:underline"
                        data-code-id={code.id}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate Code Modal */}
      <div id="generate-modal" className="fixed inset-0 bg-black/50 flex items-center justify-center hidden z-50">
        <div className="bg-background rounded-lg p-6 w-full max-w-md mx-4">
          <h2 className="text-lg font-semibold mb-4">Generate Invite Code</h2>
          <form id="generate-form" className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max Uses</label>
              <input
                type="number"
                name="maxUses"
                defaultValue="1"
                min="1"
                className="w-full px-3 py-2 border rounded-md"
              />
              <p className="text-xs text-muted-foreground mt-1">How many times can this code be used?</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Note (optional)</label>
              <input
                type="text"
                name="note"
                placeholder="e.g., For John"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Expires (optional)</label>
              <input
                type="datetime-local"
                name="expiresAt"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Generate
              </button>
              <button
                type="button"
                id="cancel-generate-btn"
                className="px-4 py-2 border rounded-md hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
});

export { pageRoutes };

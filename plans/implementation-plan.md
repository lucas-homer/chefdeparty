# chefdeparty - Implementation Plan

## Progress

### Phase 1: Project Setup - COMPLETE (2025-01-24)

**Completed:**
- [x] Git repository initialized
- [x] Next.js 15 with App Router and TypeScript
- [x] @opennextjs/cloudflare adapter configured (wrangler.toml, open-next.config.ts)
- [x] Cloudflare D1 database schema with Drizzle ORM (10 tables)
- [x] Auth.js v5 with Google OAuth (calendar scopes included)
- [x] shadcn/ui + Tailwind CSS (button, input, label, card, checkbox, select, textarea, avatar)
- [x] Vercel AI SDK with multi-provider support (Anthropic, OpenAI, Google)
- [x] Langfuse observability setup
- [x] Vitest unit testing (passing)
- [x] Playwright E2E testing (configured)
- [x] Evalite AI evaluations (configured)
- [x] All skeleton pages created

**Key Files Created:**
- `package.json` - pnpm with all dependencies
- `wrangler.toml` - Cloudflare D1 binding
- `drizzle/schema.ts` - Full database schema
- `src/lib/auth.ts` - Auth.js configuration
- `src/lib/db.ts` - Drizzle client
- `src/lib/ai.ts` - AI SDK providers
- `src/lib/langfuse.ts` - Observability
- `vitest.config.ts`, `playwright.config.ts`, `evalite.config.ts`

**Skeleton Pages:**
- `/` - Landing page
- `/login`, `/login/verify` - Auth pages
- `/parties` - Party list
- `/parties/new` - Create party form
- `/parties/[id]` - Party dashboard
- `/parties/[id]/guests` - Guest management
- `/parties/[id]/menu` - Menu planning
- `/parties/[id]/shopping` - Shopping list (checkable)
- `/parties/[id]/timeline` - Cooking timeline (checkable)
- `/recipes` - Recipe library
- `/invite/[token]` - Public RSVP page

**Build Status:** Passing (`pnpm build`)

**Next Steps (Phase 2):**
1. Create Cloudflare D1 database in cloud (`wrangler d1 create chefdeparty-db`)
2. Update wrangler.toml with actual database_id
3. Run migrations (`pnpm db:migrate:prod`)
4. Enable auth check in dashboard layout
5. Implement party CRUD API routes
6. Connect forms to API

---

## Overview
A dinner party planning app that helps hosts manage events, guests, menus, shopping, and cooking timelines.

**Domain:** chefde.party (Cloudflare registered)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js (App Router) |
| Hosting | Cloudflare Pages + Workers (@opennextjs/cloudflare) |
| Database | Cloudflare D1 (SQLite) |
| Vector DB | Cloudflare Vectorize (future) |
| AI | Vercel AI SDK (multi-provider) |
| Evals | Evalite |
| Auth | Auth.js (NextAuth v5) - Email magic links + Google OAuth |
| Email | Cloudflare Email Workers |
| UI | shadcn/ui + Tailwind CSS |
| OCR | Vision LLM for recipe extraction |

---

## Core Features (MVP)

### 1. Party Management
- Create party: name, date/time, location, description
- Edit/delete parties
- Party dashboard showing status overview

### 2. Guest Management
- Invite via shareable link OR email (Cloudflare Email Workers)
- RSVP tracking (yes/no/maybe + headcount)
- Dietary restrictions collection per guest
- Optional guest accounts (magic link auth)
- Host-defined contribution list (guests claim items)

### 3. Recipe Management
- **URL Import**: Paste recipe URL → LLM extracts structured recipe
- **Photo/PDF Import**: Upload image/PDF → Vision LLM extracts recipe
- **AI Generation**: Describe preferences → LLM generates recipe
- Recipe storage: ingredients, steps, prep time, cook time, servings
- Recipe scaling by party size

### 4. Menu Planning
- Add recipes to party menu
- AI suggestions for dietary restriction accommodations
- Conflict warnings when menu items don't match guest restrictions

### 5. Smart Grocery List
- Aggregate ingredients across all menu recipes
- Scale quantities by party size
- Consolidate duplicates (e.g., "2 cups flour" + "1 cup flour" = "3 cups flour")
- Organize by store section (produce, dairy, meat, pantry, etc.)
- Checkable list UI

### 6. Cooking Timeline
- Day-by-day prep schedule generated from recipes
- Identify tasks that need advance prep (marinades, brining, etc.)
- Day-of cooking schedule optimized for host presence with guests
- Email reminders for upcoming tasks

### 7. Google Calendar Integration
- Users connect Google Calendar via OAuth consent flow
- App stores refresh tokens securely
- Timeline tasks sync as calendar events (title, time, duration, description)
- Automatic sync when timeline is generated/updated
- Option to disconnect calendar

---

## Database Schema (D1)

```sql
-- Users (hosts and optionally guests)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Parties
CREATE TABLE parties (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  date_time INTEGER NOT NULL,
  location TEXT,
  share_token TEXT UNIQUE NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Guests (can be linked to user or standalone)
CREATE TABLE guests (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  email TEXT NOT NULL,
  name TEXT,
  rsvp_status TEXT DEFAULT 'pending', -- pending, yes, no, maybe
  headcount INTEGER DEFAULT 1,
  dietary_restrictions TEXT, -- JSON array
  created_at INTEGER DEFAULT (unixepoch())
);

-- Recipes
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  source_type TEXT, -- 'url', 'photo', 'ai', 'manual'
  ingredients TEXT NOT NULL, -- JSON array
  instructions TEXT NOT NULL, -- JSON array
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  servings INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Party Menu (recipes for a party)
CREATE TABLE party_menu (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  scaled_servings INTEGER,
  course TEXT, -- appetizer, main, side, dessert, drink
  created_at INTEGER DEFAULT (unixepoch())
);

-- Contribution Items (what host needs guests to bring)
CREATE TABLE contribution_items (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  claimed_by_guest_id TEXT REFERENCES guests(id),
  created_at INTEGER DEFAULT (unixepoch())
);

-- Cooking Timeline Tasks
CREATE TABLE timeline_tasks (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  recipe_id TEXT REFERENCES recipes(id),
  description TEXT NOT NULL,
  scheduled_date INTEGER NOT NULL,
  scheduled_time TEXT, -- e.g., "09:00" or null for anytime
  duration_minutes INTEGER,
  completed INTEGER DEFAULT 0,
  sort_order INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## Project Structure

```
/chefdeparty
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── signup/
│   │   ├── (dashboard)/
│   │   │   ├── parties/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── guests/
│   │   │   │   │   ├── menu/
│   │   │   │   │   ├── shopping/
│   │   │   │   │   └── timeline/
│   │   │   │   └── new/
│   │   │   └── recipes/
│   │   ├── invite/[token]/        # Public RSVP page
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   ├── parties/
│   │   │   ├── recipes/
│   │   │   ├── ai/
│   │   │   │   ├── generate-recipe/
│   │   │   │   ├── parse-recipe/
│   │   │   │   ├── generate-timeline/
│   │   │   │   └── suggest-modifications/
│   │   │   ├── calendar/              # Google Calendar sync
│   │   │   └── email/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/                    # shadcn components
│   │   ├── party/
│   │   ├── recipe/
│   │   ├── timeline/
│   │   └── shopping/
│   ├── lib/
│   │   ├── db.ts                  # D1 client + Drizzle
│   │   ├── ai.ts                  # AI SDK setup
│   │   ├── langfuse.ts            # Langfuse + OpenTelemetry
│   │   ├── auth.ts                # Auth.js config
│   │   ├── calendar.ts            # Google Calendar API
│   │   └── utils.ts
│   └── types/
├── drizzle/                       # DB migrations
├── evals/                         # Evalite AI evaluations
│   ├── recipe-url-parsing.eval.ts
│   ├── recipe-photo-extraction.eval.ts
│   ├── recipe-generation.eval.ts
│   ├── timeline-generation.eval.ts
│   ├── dietary-suggestions.eval.ts
│   ├── ingredient-categorization.eval.ts
│   └── fixtures/                  # Shared test data
├── e2e/                           # Playwright E2E tests
│   ├── global-setup.ts            # DB reset/seed before tests
│   ├── fixtures/
│   │   ├── db.ts                  # Database helpers
│   │   └── seed-data.ts           # Test data definitions
│   ├── auth.spec.ts
│   ├── party.spec.ts
│   ├── recipe.spec.ts
│   ├── shopping.spec.ts
│   └── timeline.spec.ts
├── public/
├── wrangler.toml                  # Cloudflare config
├── next.config.ts
├── tailwind.config.ts
├── vitest.config.ts               # Unit test config
├── evalite.config.ts              # AI eval config
├── playwright.config.ts           # E2E test config
└── package.json
```

---

## Implementation Phases

### Phase 1: Project Setup - COMPLETE
- [x] Initialize git repository
- [x] Create `plans/` directory and save this plan
- [x] Initialize Next.js with TypeScript
- [x] Configure @opennextjs/cloudflare adapter
- [x] Set up Cloudflare D1 database schema (Drizzle)
- [x] Configure Auth.js with Google OAuth
- [x] Install and configure shadcn/ui
- [x] Set up Vercel AI SDK
- [x] Set up testing infrastructure (Vitest, Playwright, Evalite)
- [ ] Deploy initial skeleton to chefde.party (pending cloud D1 setup)

### Phase 2: Core Party Flow - IN PROGRESS
- User authentication (sign up, login, logout)
- Create/edit/delete parties
- Party dashboard
- Generate shareable invite links
- Public RSVP page (collect name, email, dietary restrictions)
- Guest list management

### Phase 3: Recipe System
- Manual recipe creation form
- URL import with LLM parsing
- Photo/PDF upload with Vision LLM extraction
- AI recipe generation
- Recipe library (user's saved recipes)
- Add recipes to party menu

### Phase 4: Shopping & Timeline
- Grocery list generation from menu
- Ingredient aggregation and scaling
- Store section categorization
- Cooking timeline generation
- Day-by-day prep scheduling
- Task completion tracking

### Phase 5: Guest Contributions & Email
- Host creates contribution items list
- Guests claim items on RSVP page
- Email invite sending via Cloudflare Email Workers
- Email reminders for timeline tasks

### Phase 6: Google Calendar Integration
- Add Google OAuth provider to Auth.js (with calendar scopes)
- Build calendar sync service using Google Calendar API
- Create/update/delete calendar events for timeline tasks
- Settings page for connecting/disconnecting calendar

### Phase 7: Polish & Launch
- Mobile-responsive polish
- Error handling and edge cases
- Performance optimization
- Production deployment and testing

---

## Testing Strategy

### Unit Testing (Vitest)
- **Config**: `vitest.config.ts`
- **Location**: `src/**/*.test.ts` (co-located with source)
- **Coverage**:
  - Database queries and services
  - Utility functions (ingredient aggregation, scaling, etc.)
  - Auth helpers
  - API route handlers (mocked D1)

### E2E Testing (Playwright)
- **Config**: `playwright.config.ts`
- **Location**: `e2e/*.spec.ts`
- **Database**: Local D1 via wrangler (no cloud resources needed)
- **Test Isolation**: Reset + seed before each test suite

**Database Setup Pattern**:
```
e2e/
├── global-setup.ts          # Reset DB, run migrations, seed data
├── fixtures/
│   ├── db.ts                # resetAndSeedDatabase() helper
│   └── seed-data.ts         # Test users, parties, recipes
├── auth.spec.ts
├── party.spec.ts
└── ...
```

**Seed Data Includes**:
- Test host user (host@test.com)
- Test guest user (guest@test.com)
- Sample party with 3 guests (various dietary restrictions)
- Sample recipes (vegetarian, contains nuts, etc.)
- Sample timeline tasks

**Test Flows**:
  - Auth flow (sign up, login, logout)
  - Party creation → invite → RSVP flow
  - Recipe import (URL, manual entry)
  - Menu → shopping list generation
  - Timeline generation and task completion
  - Guest contribution claiming
  - Google Calendar connection

### AI Evaluations (Evalite - Local)
- **Config**: `evalite.config.ts` (extends vitest, 120s timeout for LLM calls)
- **Location**: `evals/*.eval.ts`
- **Scripts**:
  - `pnpm eval` → `evalite` (run once)
  - `pnpm dev:eval` → `evalite watch` (live reload)

**Evaluation Types**:
| Eval | Purpose | Scorers |
|------|---------|---------|
| `recipe-url-parsing.eval.ts` | Extract structured recipe from URLs | `answerCorrectness`, custom schema validation |
| `recipe-photo-extraction.eval.ts` | OCR + parse recipe from images | Custom ingredient/step accuracy scorer |
| `recipe-generation.eval.ts` | Generate recipes from preferences | Dietary compliance, completeness |
| `timeline-generation.eval.ts` | Create cooking schedule from recipes | Task ordering, time feasibility |
| `dietary-suggestions.eval.ts` | Suggest menu modifications for restrictions | Relevance, safety |
| `ingredient-categorization.eval.ts` | Assign ingredients to store sections | Category accuracy |

**A/B Testing Models**:
```typescript
evalite.each([
  { name: 'Claude 3.5 Sonnet', model: anthropic('claude-3-5-sonnet-20241022') },
  { name: 'GPT-4o', model: openai('gpt-4o') },
  { name: 'Gemini 2.0 Flash', model: google('gemini-2.0-flash') },
])('Recipe Parsing', { ... });
```

### Production Observability (Langfuse)
- **Setup**: OpenTelemetry SDK with `LangfuseExporter`
- **Integration**: `experimental_telemetry` in all AI SDK calls
- **Traces**: Session-based grouping (per party planning session)

**Environment Variables**:
```
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxx
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
```

**Telemetry Pattern**:
```typescript
const result = await generateText({
  model,
  prompt,
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'parse-recipe-url',
    metadata: { langfuseTraceId: trace.id },
  },
});
```

### CI/CD Testing
- **GitHub Actions**:
  - `pnpm test` → Vitest unit tests
  - `pnpm test:e2e` → Playwright (against preview deployment)
  - `pnpm eval` → Evalite (optional, requires API keys)

---

## Verification Plan

1. **Local Development**
   - `pnpm dev` with wrangler for D1 local
   - `pnpm test` for unit tests
   - `pnpm dev:eval` for live eval feedback

2. **Pre-commit**
   - Unit tests pass
   - TypeScript compilation
   - Linting

3. **PR/Deploy**
   - E2E tests against preview URL
   - Manual smoke test of AI features

4. **Production**
   - Langfuse dashboards for AI observability
   - Monitor error rates and latency
   - Review traces for edge cases

---

## Key Files to Create First

1. `package.json` - Dependencies
2. `wrangler.toml` - Cloudflare configuration
3. `next.config.ts` - Next.js + OpenNext config
4. `src/lib/db.ts` - D1 database client + Drizzle
5. `src/lib/auth.ts` - Auth.js configuration
6. `drizzle/schema.ts` - Database schema with Drizzle ORM
7. `vitest.config.ts` - Unit test configuration
8. `evalite.config.ts` - AI eval configuration (extends vitest)
9. `playwright.config.ts` - E2E test configuration
10. `src/lib/langfuse.ts` - Langfuse + OpenTelemetry setup

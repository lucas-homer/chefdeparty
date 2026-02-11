import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { createDb } from "./lib/db";
import {
  createAuthRoutes,
  getAuthConfig,
  getUser,
} from "./lib/hono-auth";
import { initAuthConfig, verifyAuth } from "@hono/auth-js";
import { PartyReminder } from "./durable-objects/party-reminder";
import { cleanupPendingInvites } from "./routes/api/invite-codes";

// Re-export Durable Object
export { PartyReminder };

// Environment type
export interface Env {
  DB: D1Database;
  PARTY_REMINDER: DurableObjectNamespace;
  ASSETS?: Fetcher;
  RESEND_API_KEY: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  AUTH_SECRET: string;
  AUTH_GOOGLE_ID: string;
  AUTH_GOOGLE_SECRET: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  CRON_SECRET?: string;
  APP_URL?: string;
  TAVILY_API_KEY?: string;
  ADMIN_EMAILS?: string;
  NODE_ENV?: string;
  // Twilio SMS credentials
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
  TWILIO_PHONE_NUMBER?: string;
}

// Context variables available in routes
type Variables = {
  db: ReturnType<typeof createDb>;
};

type ViteManifestEntry = {
  file: string;
  name?: string;
  isEntry?: boolean;
  css?: string[];
};

type ViteManifest = Record<string, ViteManifestEntry>;

const MANIFEST_CACHE_TTL_MS = 5000;

let manifestCache:
  | {
      manifest: ViteManifest;
      loadedAt: number;
    }
  | null = null;
let manifestLoadPromise: Promise<ViteManifest | null> | null = null;

async function loadViteManifest(
  assets: Fetcher,
  requestUrlForBase: string
): Promise<ViteManifest | null> {
  if (manifestCache && Date.now() - manifestCache.loadedAt < MANIFEST_CACHE_TTL_MS) {
    return manifestCache.manifest;
  }

  if (manifestLoadPromise) {
    return manifestLoadPromise;
  }

  manifestLoadPromise = (async () => {
    try {
      const manifestUrl = new URL("/assets/.vite/manifest.json", requestUrlForBase).toString();
      const response = await assets.fetch(manifestUrl);
      if (!response.ok) {
        return null;
      }

      const manifest = (await response.json()) as ViteManifest;
      manifestCache = { manifest, loadedAt: Date.now() };
      return manifest;
    } catch {
      return null;
    } finally {
      manifestLoadPromise = null;
    }
  })();

  return manifestLoadPromise;
}

function getEntryFromManifest(manifest: ViteManifest, entryName: string): ViteManifestEntry | null {
  for (const entry of Object.values(manifest)) {
    if (entry.isEntry && entry.name === entryName) {
      return entry;
    }
  }
  return null;
}

function resolveAssetAliasPath(
  manifest: ViteManifest | null,
  requestPathname: string
): string | null {
  if (!manifest || !requestPathname.startsWith("/assets/")) {
    return null;
  }

  if (requestPathname === "/assets/main.css") {
    const mainEntry = getEntryFromManifest(manifest, "main");
    const cssFile = mainEntry?.css?.[0];
    return cssFile ? `/assets/${cssFile}` : null;
  }

  const jsMatch = requestPathname.match(/^\/assets\/([a-z0-9-]+)\.js$/i);
  if (jsMatch) {
    const entryName = jsMatch[1];
    const entry = getEntryFromManifest(manifest, entryName);
    return entry?.file ? `/assets/${entry.file}` : null;
  }

  return null;
}

function isFingerprintAssetPath(pathname: string): boolean {
  return /-[a-z0-9_-]{8,}\.(js|css)$/i.test(pathname);
}

function buildAssetReplacementMap(manifest: ViteManifest): Map<string, string> {
  const replacements = new Map<string, string>();

  for (const entry of Object.values(manifest)) {
    if (!entry.isEntry || !entry.name || !entry.file) continue;
    replacements.set(`/assets/${entry.name}.js`, `/assets/${entry.file}`);
  }

  const mainEntry = getEntryFromManifest(manifest, "main");
  const mainCss = mainEntry?.css?.[0];
  if (mainCss) {
    replacements.set("/assets/main.css", `/assets/${mainCss}`);
  }

  return replacements;
}

async function getAssetReplacementMap(
  assets: Fetcher,
  requestUrlForBase: string
): Promise<Map<string, string> | null> {
  const manifest = await loadViteManifest(assets, requestUrlForBase);
  if (!manifest) return null;
  return buildAssetReplacementMap(manifest);
}

// Create the main Hono app
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use("*", logger());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: (origin) => origin,
    credentials: true,
  })
);

// Rewrite HTML asset URLs to hashed build artifacts from Vite manifest.
// This keeps template code simple while ensuring deploys always point at the latest bundles.
app.use("*", async (c, next) => {
  await next();

  if (!c.env.ASSETS) return;

  const contentType = c.res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return;

  const replacementMap = await getAssetReplacementMap(c.env.ASSETS, c.req.url);
  if (!replacementMap || replacementMap.size === 0) return;

  const originalHtml = await c.res.text();
  let rewrittenHtml = originalHtml;

  for (const [from, to] of replacementMap) {
    rewrittenHtml = rewrittenHtml.replaceAll(from, to);
  }

  if (rewrittenHtml === originalHtml) return;

  const headers = new Headers(c.res.headers);
  headers.delete("content-length");

  c.res = new Response(rewrittenHtml, {
    status: c.res.status,
    statusText: c.res.statusText,
    headers,
  });
});

// Add database to context
app.use("*", async (c, next) => {
  const db = createDb(c.env.DB);
  c.set("db", db);
  await next();
});

// Initialize auth config for all routes
app.use("*", initAuthConfig(getAuthConfig));

// Populate authUser context for all routes (doesn't throw on unauthenticated)
app.use("*", async (c, next) => {
  try {
    const middleware = verifyAuth();
    await middleware(c, next);
  } catch (_e) {
    // If verifyAuth throws (401), just continue without setting authUser
    await next();
  }
});

// Mount auth routes
const authRoutes = createAuthRoutes();
app.route("/api/auth", authRoutes);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve static assets with explicit cache rules.
// This avoids stale JS/CSS sticking around behind browser/CDN caches when filenames are stable.
app.get("/assets/*", async (c) => {
  if (!c.env.ASSETS) {
    return c.notFound();
  }

  const requestUrl = new URL(c.req.url);
  const manifest = await loadViteManifest(c.env.ASSETS, c.req.url);
  const resolvedAliasPath = resolveAssetAliasPath(manifest, requestUrl.pathname);
  const targetPath = resolvedAliasPath || requestUrl.pathname;

  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = targetPath;

  const assetResponse = await c.env.ASSETS.fetch(assetUrl.toString());

  let cacheControl = "no-store";
  if (assetResponse.ok && c.env.NODE_ENV === "production") {
    if (resolvedAliasPath) {
      // Stable aliases always revalidate so a deploy swaps clients quickly.
      cacheControl = "no-store";
    } else if (isFingerprintAssetPath(targetPath)) {
      // Fingerprinted files are safe to cache aggressively.
      cacheControl = "public, max-age=31536000, immutable";
    } else {
      cacheControl = "public, max-age=0, must-revalidate";
    }
  }

  const headers = new Headers(assetResponse.headers);
  if (assetResponse.status === 404 && !headers.get("Content-Type")) {
    headers.set("Content-Type", "text/plain; charset=utf-8");
  }
  headers.set("Cache-Control", cacheControl);
  headers.set("CDN-Cache-Control", cacheControl);

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
});

// Import and mount API route modules
import { apiRoutes } from "./routes/api";
import { pageRoutes } from "./routes/pages";

app.route("/api", apiRoutes);

// Mount page routes
app.route("/", pageRoutes);

// Login page is handled in pageRoutes.

// Home page - redirect to parties if logged in, show login otherwise
app.get("/", (c) => {
  const user = getUser(c);
  if (user) {
    return c.redirect("/parties");
  }
  return c.redirect("/login");
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "Internal Server Error",
      message: c.env.NODE_ENV === "development" ? err.message : undefined,
    },
    500
  );
});

// Export the app with scheduled handler for cron jobs
export default {
  fetch: app.fetch,
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const db = createDb(env.DB);

    // Clean up stale pending invites (> 24 hours old)
    ctx.waitUntil(
      cleanupPendingInvites(db).then((count) => {
        if (count > 0) {
          console.log(`Cleaned up ${count} stale pending invites`);
        }
      })
    );
  },
};

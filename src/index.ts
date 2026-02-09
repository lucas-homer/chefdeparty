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

// Login page
app.get("/login", (c) => {
  const user = getUser(c);
  if (user) {
    return c.redirect("/parties");
  }

  const error = c.req.query("error");
  const callbackUrl = c.req.query("callbackUrl") || "/parties";
  let errorMessage = "";
  let successMessage = "";

  if (error === "InviteRequired") {
    errorMessage = "An invite code is required to sign up. Please enter your invite code below.";
  } else if (error === "InvalidInviteCode") {
    errorMessage = "The invite code you entered is invalid.";
  } else if (error === "InviteCodeExpired") {
    errorMessage = "This invite code has expired.";
  } else if (error === "InviteCodeUsed") {
    errorMessage = "This invite code has already been used.";
  } else if (error === "Verification") {
    successMessage = "Check your email! We sent you a sign-in link.";
  }

  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login - ChefDeParty</title>
        <link href="/assets/main.css" rel="stylesheet">
        <style>
          .error-message { color: #ef4444; font-size: 0.875rem; margin-bottom: 1rem; padding: 0.75rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 0.375rem; }
          .success-message { color: #16a34a; font-size: 0.875rem; margin-bottom: 1rem; padding: 0.75rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 0.375rem; }
          .info-message { color: #0369a1; font-size: 0.875rem; margin-bottom: 1rem; padding: 0.75rem; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 0.375rem; }
          .text-input { width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1rem; margin-bottom: 0.75rem; }
          .text-input:focus { outline: none; border-color: #000; box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1); }
          .invite-input { width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; }
          .invite-input:focus { outline: none; border-color: #000; box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1); }
          .otp-input { width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1.5rem; text-align: center; letter-spacing: 0.5em; margin-bottom: 0.75rem; }
          .otp-input:focus { outline: none; border-color: #000; box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1); }
          .primary-btn { width: 100%; padding: 0.75rem; background: #000; color: #fff; border: none; border-radius: 0.375rem; cursor: pointer; font-size: 1rem; font-weight: 500; }
          .primary-btn:hover { background: #333; }
          .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .secondary-btn { width: 100%; padding: 0.75rem; background: #fff; color: #333; border: 1px solid #d1d5db; border-radius: 0.375rem; cursor: pointer; font-size: 0.875rem; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
          .secondary-btn:hover { background: #f9fafb; }
          .divider { display: flex; align-items: center; margin: 1.5rem 0; }
          .divider-line { flex: 1; height: 1px; background: #e5e7eb; }
          .divider-text { padding: 0 1rem; color: #6b7280; font-size: 0.875rem; }
          .invite-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
          .invite-toggle { color: #6b7280; font-size: 0.875rem; cursor: pointer; text-decoration: underline; }
          .invite-toggle:hover { color: #000; }
          .hidden { display: none; }
          .helper-text { font-size: 0.75rem; color: #6b7280; margin-top: 0.5rem; }
          .tabs { display: flex; border-bottom: 1px solid #e5e7eb; margin-bottom: 1.5rem; }
          .tab { flex: 1; padding: 0.75rem 1rem; background: none; border: none; cursor: pointer; font-size: 0.875rem; font-weight: 500; color: #6b7280; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.2s; }
          .tab:hover { color: #000; }
          .tab.active { color: #000; border-bottom-color: #000; }
          .tab-content { display: none; }
          .tab-content.active { display: block; }
          .link-btn { background: none; border: none; color: #6b7280; text-decoration: underline; cursor: pointer; font-size: 0.875rem; }
          .link-btn:hover { color: #000; }
          .view-toggle { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; text-align: center; }
        </style>
      </head>
      <body class="min-h-screen bg-background flex items-center justify-center">
        <div class="w-full max-w-md p-8">
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold">ChefDeParty</h1>
            <p class="text-muted-foreground mt-2">Plan your perfect dinner party</p>
          </div>
          <div class="border rounded-lg p-6 bg-card">
            ${errorMessage ? `<div class="error-message">${errorMessage}</div>` : ""}
            ${successMessage ? `<div class="info-message">${successMessage}</div>` : ""}
            <div id="message"></div>

            <!-- Sign In View (default for returning users) -->
            <div id="signin-view">
              <h2 class="text-xl font-semibold mb-4">Sign in</h2>

              <!-- Auth Method Tabs -->
              <div class="tabs">
                <button type="button" class="tab active" data-tab="signin-email" onclick="switchTab('signin-email')">Email</button>
                <button type="button" class="tab" data-tab="signin-phone" onclick="switchTab('signin-phone')">Phone</button>
              </div>

              <!-- Email Tab -->
              <div id="signin-email-tab" class="tab-content active">
                <form id="email-form" onsubmit="handleEmailSignIn(event)">
                  <input type="hidden" name="csrfToken" id="csrf-token-email" value="">
                  <input type="hidden" name="callbackUrl" value="${callbackUrl}">
                  <p class="text-sm text-muted-foreground mb-3">
                    Enter your email and we'll send you a magic link to sign in.
                  </p>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    class="text-input"
                    placeholder="your@email.com"
                    required
                    autocomplete="email"
                  >
                  <button type="submit" id="email-btn" class="primary-btn">
                    Send Magic Link
                  </button>
                </form>

                <div class="divider">
                  <div class="divider-line"></div>
                  <span class="divider-text">or</span>
                  <div class="divider-line"></div>
                </div>

                <!-- Google Sign In -->
                <form id="google-form" action="/api/auth/signin/google" method="POST">
                  <input type="hidden" name="csrfToken" id="csrf-token-google" value="">
                  <input type="hidden" name="callbackUrl" value="${callbackUrl}">
                  <button type="submit" class="secondary-btn">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </button>
                </form>
              </div>

              <!-- Phone Tab -->
              <div id="signin-phone-tab" class="tab-content">
                <!-- Step 1: Enter Phone -->
                <div id="phone-step-1">
                  <p class="text-sm text-muted-foreground mb-3">
                    Enter your phone number and we'll send you a verification code.
                  </p>
                  <input
                    type="tel"
                    id="phone"
                    class="text-input"
                    placeholder="+1 (555) 555-1234"
                    autocomplete="tel"
                  >
                  <button type="button" id="send-otp-btn" class="primary-btn" onclick="sendOtp(false)">
                    Send Code
                  </button>
                </div>

                <!-- Step 2: Enter OTP -->
                <div id="phone-step-2" class="hidden">
                  <p class="text-sm text-muted-foreground mb-3">
                    Enter the 6-digit code we sent to <span id="phone-display"></span>
                  </p>
                  <input
                    type="text"
                    id="otp-code"
                    class="otp-input"
                    placeholder="000000"
                    maxlength="6"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                  >
                  <button type="button" id="verify-otp-btn" class="primary-btn" onclick="verifyOtp()">
                    Verify Code
                  </button>
                  <p class="helper-text" style="margin-top: 1rem; text-align: center;">
                    <button type="button" class="link-btn" onclick="backToPhoneInput()">
                      Use a different number
                    </button>
                    <span style="margin: 0 0.5rem; color: #d1d5db;">|</span>
                    <button type="button" class="link-btn" id="resend-btn" onclick="sendOtp(false)">
                      Resend code
                    </button>
                  </p>
                </div>
              </div>

              <!-- Toggle to Register View -->
              <div class="view-toggle">
                <button type="button" class="link-btn" onclick="toggleView('register')">
                  First time? I have an invite code &rarr;
                </button>
              </div>
            </div>

            <!-- Register View (for new users with invite codes) -->
            <div id="register-view" class="hidden">
              <h2 class="text-xl font-semibold mb-4">Register</h2>
              <p class="text-sm text-muted-foreground mb-4">
                Enter your invite code to create an account
              </p>

              <input
                type="text"
                id="invite-code"
                class="invite-input"
                placeholder="INVITE CODE"
                maxlength="8"
                autocomplete="off"
              >

              <!-- Auth Method Tabs -->
              <div class="tabs">
                <button type="button" class="tab active" data-tab="register-email" onclick="switchTab('register-email')">Email</button>
                <button type="button" class="tab" data-tab="register-phone" onclick="switchTab('register-phone')">Phone</button>
              </div>

              <!-- Email Tab -->
              <div id="register-email-tab" class="tab-content active">
                <p class="helper-text" style="margin-bottom: 0.5rem;">
                  For Google sign-in, enter your Google account email and click "Register with Google" below.
                </p>
                <input
                  type="email"
                  id="register-email"
                  class="text-input"
                  placeholder="your@email.com"
                  autocomplete="email"
                >
                <button type="button" id="register-email-btn" class="primary-btn" onclick="registerWithEmail()">
                  Register with Email
                </button>

                <div class="divider">
                  <div class="divider-line"></div>
                  <span class="divider-text">or</span>
                  <div class="divider-line"></div>
                </div>

                <!-- Google Register -->
                <form id="google-register-form" action="/api/auth/signin/google" method="POST" onsubmit="return handleGoogleRegister(event)">
                  <input type="hidden" name="csrfToken" id="csrf-token-google-register" value="">
                  <input type="hidden" name="callbackUrl" value="${callbackUrl}">
                  <button type="submit" class="secondary-btn">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Register with Google
                  </button>
                </form>
              </div>

              <!-- Phone Tab -->
              <div id="register-phone-tab" class="tab-content">
                <!-- Step 1: Enter Phone -->
                <div id="register-phone-step-1">
                  <p class="text-sm text-muted-foreground mb-3">
                    Enter your phone number and we'll send you a verification code.
                  </p>
                  <input
                    type="tel"
                    id="register-phone"
                    class="text-input"
                    placeholder="+1 (555) 555-1234"
                    autocomplete="tel"
                  >
                  <button type="button" id="register-send-otp-btn" class="primary-btn" onclick="registerWithPhone()">
                    Register with Phone
                  </button>
                </div>

                <!-- Step 2: Enter OTP -->
                <div id="register-phone-step-2" class="hidden">
                  <p class="text-sm text-muted-foreground mb-3">
                    Enter the 6-digit code we sent to <span id="register-phone-display"></span>
                  </p>
                  <input
                    type="text"
                    id="register-otp-code"
                    class="otp-input"
                    placeholder="000000"
                    maxlength="6"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                  >
                  <button type="button" id="register-verify-otp-btn" class="primary-btn" onclick="verifyRegisterOtp()">
                    Verify Code
                  </button>
                  <p class="helper-text" style="margin-top: 1rem; text-align: center;">
                    <button type="button" class="link-btn" onclick="backToRegisterPhoneInput()">
                      Use a different number
                    </button>
                    <span style="margin: 0 0.5rem; color: #d1d5db;">|</span>
                    <button type="button" class="link-btn" onclick="registerWithPhone()">
                      Resend code
                    </button>
                  </p>
                </div>
              </div>

              <!-- Toggle to Sign In View -->
              <div class="view-toggle">
                <button type="button" class="link-btn" onclick="toggleView('signin')">
                  &larr; Already have an account? Sign in
                </button>
              </div>
            </div>
          </div>
        </div>
        <script>
          // State
          let currentPhone = '';
          let currentRegisterPhone = '';

          // Fetch CSRF token for Auth.js
          fetch('/api/auth/csrf')
            .then(res => res.json())
            .then(data => {
              document.getElementById('csrf-token-email').value = data.csrfToken;
              document.getElementById('csrf-token-google').value = data.csrfToken;
              document.getElementById('csrf-token-google-register').value = data.csrfToken;
            })
            .catch(console.error);

          // View switching between sign-in and register
          function toggleView(view) {
            const signinView = document.getElementById('signin-view');
            const registerView = document.getElementById('register-view');
            const messageDiv = document.getElementById('message');
            messageDiv.innerHTML = '';

            if (view === 'register') {
              signinView.classList.add('hidden');
              registerView.classList.remove('hidden');
            } else {
              registerView.classList.add('hidden');
              signinView.classList.remove('hidden');
            }
          }

          // Tab switching
          function switchTab(tab) {
            // Determine which view we're in based on the tab prefix
            const isRegister = tab.startsWith('register-');
            const viewPrefix = isRegister ? 'register-' : 'signin-';
            const viewId = isRegister ? 'register-view' : 'signin-view';
            const view = document.getElementById(viewId);

            // Only affect tabs within the current view
            view.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            view.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            view.querySelector('.tab[data-tab="' + tab + '"]').classList.add('active');
            document.getElementById(tab + '-tab').classList.add('active');
            document.getElementById('message').innerHTML = '';
          }

          async function handleEmailSignIn(e) {
            e.preventDefault();
            const form = e.target;
            const email = document.getElementById('email').value.trim();
            const csrfToken = document.getElementById('csrf-token-email').value;
            const emailBtn = document.getElementById('email-btn');
            const messageDiv = document.getElementById('message');

            if (!email) {
              messageDiv.innerHTML = '<div class="error-message">Please enter your email address.</div>';
              return;
            }

            emailBtn.disabled = true;
            emailBtn.textContent = 'Sending...';

            try {
              const response = await fetch('/api/auth/signin/resend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  csrfToken: csrfToken,
                  email: email,
                  callbackUrl: form.querySelector('[name="callbackUrl"]').value
                })
              });

              if (response.redirected) {
                window.location.href = response.url;
              } else if (response.ok) {
                messageDiv.innerHTML = '<div class="info-message">Check your email! We sent you a sign-in link. It may take a minute to arrive.</div>';
                emailBtn.textContent = 'Email Sent';
              } else {
                throw new Error('Failed to send email');
              }
            } catch (err) {
              messageDiv.innerHTML = '<div class="error-message">Failed to send magic link. Please try again.</div>';
              emailBtn.disabled = false;
              emailBtn.textContent = 'Send Magic Link';
            }
          }

          // Register with Email - validates invite code then sends magic link
          async function registerWithEmail() {
            const code = document.getElementById('invite-code').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const messageDiv = document.getElementById('message');
            const registerBtn = document.getElementById('register-email-btn');

            if (!code) {
              messageDiv.innerHTML = '<div class="error-message">Please enter an invite code.</div>';
              return;
            }
            if (!email) {
              messageDiv.innerHTML = '<div class="error-message">Please enter your email address.</div>';
              return;
            }

            registerBtn.disabled = true;
            registerBtn.textContent = 'Validating...';

            try {
              // First validate the invite code
              const validateResponse = await fetch('/api/invite-codes/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, email })
              });

              const validateData = await validateResponse.json();

              if (!validateData.valid) {
                messageDiv.innerHTML = '<div class="error-message">' + (validateData.error || 'Invalid invite code.') + '</div>';
                registerBtn.disabled = false;
                registerBtn.textContent = 'Register with Email';
                return;
              }

              // Invite code validated, now send magic link
              registerBtn.textContent = 'Sending...';
              const csrfToken = document.getElementById('csrf-token-email').value;

              const response = await fetch('/api/auth/signin/resend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  csrfToken: csrfToken,
                  email: email,
                  callbackUrl: '${callbackUrl}'
                })
              });

              if (response.redirected) {
                window.location.href = response.url;
              } else if (response.ok) {
                messageDiv.innerHTML = '<div class="info-message">Check your email! We sent you a sign-in link to complete your registration.</div>';
                registerBtn.textContent = 'Email Sent';
              } else {
                throw new Error('Failed to send email');
              }
            } catch (err) {
              messageDiv.innerHTML = '<div class="error-message">An error occurred. Please try again.</div>';
              registerBtn.disabled = false;
              registerBtn.textContent = 'Register with Email';
            }
          }

          // Handle Google registration - validates invite code first
          async function handleGoogleRegister(e) {
            e.preventDefault();
            const code = document.getElementById('invite-code').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const messageDiv = document.getElementById('message');

            if (!code) {
              messageDiv.innerHTML = '<div class="error-message">Please enter an invite code.</div>';
              return false;
            }
            if (!email) {
              messageDiv.innerHTML = '<div class="error-message">Please enter your Google account email.</div>';
              return false;
            }

            try {
              // Validate the invite code first
              const validateResponse = await fetch('/api/invite-codes/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, email })
              });

              const validateData = await validateResponse.json();

              if (!validateData.valid) {
                messageDiv.innerHTML = '<div class="error-message">' + (validateData.error || 'Invalid invite code.') + '</div>';
                return false;
              }

              // Invite code validated, submit the Google form
              document.getElementById('google-register-form').submit();
              return true;
            } catch (err) {
              messageDiv.innerHTML = '<div class="error-message">An error occurred. Please try again.</div>';
              return false;
            }
          }

          // Sign-in phone OTP flow
          async function sendOtp(isResend) {
            const phone = document.getElementById('phone').value.trim();
            const messageDiv = document.getElementById('message');
            const sendBtn = document.getElementById('send-otp-btn');

            if (!phone) {
              messageDiv.innerHTML = '<div class="error-message">Please enter your phone number.</div>';
              return;
            }

            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending...';

            try {
              const response = await fetch('/api/phone-auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
              });

              const data = await response.json();

              if (data.success) {
                currentPhone = phone;
                document.getElementById('phone-display').textContent = phone;
                document.getElementById('phone-step-1').classList.add('hidden');
                document.getElementById('phone-step-2').classList.remove('hidden');
                messageDiv.innerHTML = '<div class="info-message">Verification code sent! Check your phone.</div>';
                document.getElementById('otp-code').focus();
              } else if (data.requiresInvite) {
                // New user without invite code - prompt them to use register view
                messageDiv.innerHTML = '<div class="error-message">New user? Please use the "First time? I have an invite code" link below to register.</div>';
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send Code';
              } else {
                messageDiv.innerHTML = '<div class="error-message">' + (data.error || 'Failed to send code.') + '</div>';
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send Code';
              }
            } catch (err) {
              messageDiv.innerHTML = '<div class="error-message">Failed to send verification code. Please try again.</div>';
              sendBtn.disabled = false;
              sendBtn.textContent = 'Send Code';
            }
          }

          async function verifyOtp() {
            const code = document.getElementById('otp-code').value.trim();
            const messageDiv = document.getElementById('message');
            const verifyBtn = document.getElementById('verify-otp-btn');

            if (!code || code.length !== 6) {
              messageDiv.innerHTML = '<div class="error-message">Please enter the 6-digit code.</div>';
              return;
            }

            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Verifying...';

            try {
              const response = await fetch('/api/phone-auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: currentPhone, code })
              });

              const data = await response.json();

              if (data.success) {
                messageDiv.innerHTML = '<div class="success-message">Verified! Redirecting...</div>';
                window.location.href = '${callbackUrl}';
              } else {
                messageDiv.innerHTML = '<div class="error-message">' + (data.error || 'Invalid code.') + '</div>';
                verifyBtn.disabled = false;
                verifyBtn.textContent = 'Verify Code';
              }
            } catch (err) {
              messageDiv.innerHTML = '<div class="error-message">Failed to verify code. Please try again.</div>';
              verifyBtn.disabled = false;
              verifyBtn.textContent = 'Verify Code';
            }
          }

          function backToPhoneInput() {
            document.getElementById('phone-step-1').classList.remove('hidden');
            document.getElementById('phone-step-2').classList.add('hidden');
            document.getElementById('otp-code').value = '';
            document.getElementById('send-otp-btn').disabled = false;
            document.getElementById('send-otp-btn').textContent = 'Send Code';
            document.getElementById('message').innerHTML = '';
          }

          // Register phone OTP flow
          async function registerWithPhone() {
            const code = document.getElementById('invite-code').value.trim();
            const phone = document.getElementById('register-phone').value.trim();
            const messageDiv = document.getElementById('message');
            const sendBtn = document.getElementById('register-send-otp-btn');

            if (!code) {
              messageDiv.innerHTML = '<div class="error-message">Please enter an invite code.</div>';
              return;
            }
            if (!phone) {
              messageDiv.innerHTML = '<div class="error-message">Please enter your phone number.</div>';
              return;
            }

            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending...';

            try {
              const response = await fetch('/api/phone-auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, inviteCode: code })
              });

              const data = await response.json();

              if (data.success) {
                currentRegisterPhone = phone;
                document.getElementById('register-phone-display').textContent = phone;
                document.getElementById('register-phone-step-1').classList.add('hidden');
                document.getElementById('register-phone-step-2').classList.remove('hidden');
                messageDiv.innerHTML = '<div class="info-message">Verification code sent! Check your phone.</div>';
                document.getElementById('register-otp-code').focus();
              } else {
                messageDiv.innerHTML = '<div class="error-message">' + (data.error || 'Failed to send code.') + '</div>';
                sendBtn.disabled = false;
                sendBtn.textContent = 'Register with Phone';
              }
            } catch (err) {
              messageDiv.innerHTML = '<div class="error-message">Failed to send verification code. Please try again.</div>';
              sendBtn.disabled = false;
              sendBtn.textContent = 'Register with Phone';
            }
          }

          async function verifyRegisterOtp() {
            const code = document.getElementById('register-otp-code').value.trim();
            const messageDiv = document.getElementById('message');
            const verifyBtn = document.getElementById('register-verify-otp-btn');

            if (!code || code.length !== 6) {
              messageDiv.innerHTML = '<div class="error-message">Please enter the 6-digit code.</div>';
              return;
            }

            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Verifying...';

            try {
              const response = await fetch('/api/phone-auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: currentRegisterPhone, code })
              });

              const data = await response.json();

              if (data.success) {
                messageDiv.innerHTML = '<div class="success-message">Verified! Redirecting...</div>';
                window.location.href = '${callbackUrl}';
              } else {
                messageDiv.innerHTML = '<div class="error-message">' + (data.error || 'Invalid code.') + '</div>';
                verifyBtn.disabled = false;
                verifyBtn.textContent = 'Verify Code';
              }
            } catch (err) {
              messageDiv.innerHTML = '<div class="error-message">Failed to verify code. Please try again.</div>';
              verifyBtn.disabled = false;
              verifyBtn.textContent = 'Verify Code';
            }
          }

          function backToRegisterPhoneInput() {
            document.getElementById('register-phone-step-1').classList.remove('hidden');
            document.getElementById('register-phone-step-2').classList.add('hidden');
            document.getElementById('register-otp-code').value = '';
            document.getElementById('register-send-otp-btn').disabled = false;
            document.getElementById('register-send-otp-btn').textContent = 'Register with Phone';
            document.getElementById('message').innerHTML = '';
          }

          // Auto-uppercase invite code input
          document.getElementById('invite-code').addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase();
          });

          // Only allow numbers in OTP inputs
          document.getElementById('otp-code').addEventListener('input', function(e) {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
          });
          document.getElementById('register-otp-code').addEventListener('input', function(e) {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
          });
        </script>
      </body>
    </html>
  `);
});

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

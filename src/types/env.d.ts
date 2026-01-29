// Cloudflare Workers environment bindings
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    PARTY_REMINDER: DurableObjectNamespace;
    RESEND_API_KEY: string;
    GOOGLE_GENERATIVE_AI_API_KEY: string;
    AUTH_SECRET: string;
    AUTH_GOOGLE_ID: string;
    AUTH_GOOGLE_SECRET: string;
    LANGFUSE_PUBLIC_KEY?: string;
    LANGFUSE_SECRET_KEY?: string;
    CRON_SECRET?: string;
    APP_URL?: string;
    NODE_ENV?: string;
  }
}

// Augment Hono context with our variables
declare module "hono" {
  interface ContextVariableMap {
    db: import("../lib/db").Database;
    user?: {
      id: string;
      email: string | null;
      name: string | null;
      image: string | null;
    };
  }
}

export {};

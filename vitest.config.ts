import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default environment for unit tests; component tests use jsdom via comment directive
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Allow per-file environment override with @vitest-environment jsdom
    environmentMatchGlobs: [
      // Component tests (*.test.tsx in client/) use jsdom
      ["client/**/*.test.tsx", "jsdom"],
      ["src/**/*.component.test.tsx", "jsdom"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules",
        ".next",
        "drizzle",
        "e2e",
        "evals",
        "**/*.d.ts",
        "**/*.config.*",
        "src/test/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

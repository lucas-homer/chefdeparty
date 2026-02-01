import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/assets",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Main entry with CSS
        main: path.resolve(__dirname, "client/main.ts"),
        // Client entry points for islands (loaded separately)
        timeline: path.resolve(__dirname, "client/timeline.tsx"),
        "recipe-form": path.resolve(__dirname, "client/recipe-form.tsx"),
        "guest-dialog": path.resolve(__dirname, "client/guest-dialog.tsx"),
        "calendar-card": path.resolve(__dirname, "client/calendar-card.tsx"),
        "share-link": path.resolve(__dirname, "client/share-link.tsx"),
        // New feature components
        "import-recipe": path.resolve(__dirname, "client/import-recipe.tsx"),
        "recipe-chat": path.resolve(__dirname, "client/recipe-chat.tsx"),
        "party-wizard": path.resolve(__dirname, "client/party-wizard/index.tsx"),
        // User menu drawer (loaded on all authenticated pages)
        "user-menu": path.resolve(__dirname, "client/user-menu.tsx"),
        // Admin components
        admin: path.resolve(__dirname, "client/admin.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
      },
    },
    minify: "esbuild",
    target: "esnext",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // CSS processing
  css: {
    postcss: "./postcss.config.mjs",
  },
});

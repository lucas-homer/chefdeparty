import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    // Next.js paths (legacy, for transition)
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Hono paths
    "./src/routes/**/*.{ts,tsx}",
    "./client/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["Fraunces", "Georgia", "serif"],
        body: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "Menlo", "monospace"],
      },
      fontSize: {
        display: [
          "3rem",
          { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        title: [
          "2rem",
          { lineHeight: "1.2", letterSpacing: "-0.015em", fontWeight: "600" },
        ],
        subtitle: [
          "1.25rem",
          { lineHeight: "1.4", letterSpacing: "-0.01em", fontWeight: "500" },
        ],
        label: [
          "0.8125rem",
          { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" },
        ],
        caption: [
          "0.75rem",
          { lineHeight: "1.5", letterSpacing: "0.03em", fontWeight: "400" },
        ],
      },
      spacing: {
        "omk-xs": "0.25rem",
        "omk-sm": "0.5rem",
        "omk-md": "1rem",
        "omk-lg": "1.5rem",
        "omk-xl": "2rem",
        "omk-2xl": "3rem",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "warm-sm": "0 1px 2px hsl(30 20% 50% / 0.06)",
        "warm-md":
          "0 2px 4px hsl(30 20% 50% / 0.06), 0 4px 12px hsl(30 20% 50% / 0.04)",
        "warm-lg":
          "0 4px 8px hsl(30 20% 50% / 0.06), 0 8px 24px hsl(30 20% 50% / 0.08), 0 16px 40px hsl(30 20% 50% / 0.04)",
      },
      transitionTimingFunction: {
        "expo-out": "cubic-bezier(0.16, 1, 0.3, 1)",
        "expo-in-out": "cubic-bezier(0.87, 0, 0.13, 1)",
      },
      transitionDuration: {
        quick: "150ms",
        normal: "250ms",
        slow: "400ms",
        deliberate: "600ms",
      },
      keyframes: {
        "omakase-in": {
          from: { opacity: "0", transform: "scale(0.96) translateY(4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "omakase-out": {
          from: { opacity: "1", transform: "scale(1) translateY(0)" },
          to: { opacity: "0", transform: "scale(0.96) translateY(4px)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "shoji-open": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "shoji-close": {
          from: { opacity: "1", transform: "translateX(0)" },
          to: { opacity: "0", transform: "translateX(-8px)" },
        },
        breathe: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.7" },
        },
      },
      animation: {
        "omakase-in":
          "omakase-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
        "omakase-out":
          "omakase-out 0.25s cubic-bezier(0.7, 0, 0.84, 0) both",
        "slide-up":
          "slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "shoji-open":
          "shoji-open 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "shoji-close":
          "shoji-close 0.3s cubic-bezier(0.7, 0, 0.84, 0) both",
        breathe: "breathe 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

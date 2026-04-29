import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "#3F3F46",
        input: "#3F3F46",
        ring: "#F5A623",
        background: "#111111",
        foreground: "#FFFFFF",
        primary: {
          DEFAULT: "#111113",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#008C89",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#EAB308",
          foreground: "#111111",
        },
        success: "#2DBE7A",
        warning: "#F5A524",
        danger:  "#E24B4A",
        muted: {
          DEFAULT: "#313136",
          foreground: "#888888",
        },
        card: "#27272A",
        enerman: {
          gold:    "#EAB308",
          dark:    "#1E1E20",
          "dark-2":"#27272A",
          "dark-3":"#313136",
          "dark-4":"#3F3F46",
          success: "#2DBE7A",
          danger:  "#E24B4A",
        },
      },
      boxShadow: {
        soft:        "0 14px 40px -24px rgba(0, 0, 0, 0.70)",
        panel:       "0 20px 60px -20px rgba(0, 0, 0, 0.60)",
        card:        "0 1px 3px rgba(0, 0, 0, 0.40), 0 8px 24px -8px rgba(0, 0, 0, 0.50)",
        "card-hover":"0 4px 16px rgba(0, 0, 0, 0.50), 0 20px 44px -8px rgba(0, 0, 0, 0.70)",
        "glow-sm":   "0 0 0 3px rgba(0, 140, 137, 0.30)",
        "glow-gold": "0 0 16px rgba(234, 179, 8, 0.40), 0 0 0 3px rgba(234, 179, 8, 0.20)",
        "glow-danger":"0 0 0 3px rgba(226, 75, 74, 0.30)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(ellipse 65% 50% at -5% -5%, rgba(0, 140, 137, 0.08), transparent 55%), radial-gradient(ellipse 50% 40% at 105% -5%, rgba(234, 179, 8, 0.05), transparent 50%), radial-gradient(ellipse 30% 25% at 70% 108%, rgba(234, 179, 8, 0.04), transparent 55%)",
      },
    },
  },
  plugins: [],
};

export default config;

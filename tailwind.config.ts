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
          DEFAULT: "#F5A623",
          foreground: "#111111",
        },
        // ── Tokens semánticos via CSS variables ─────────────────────────────
        // Formato rgb(var(--x) / <alpha-value>) habilita modificadores de
        // opacidad Tailwind: bg-surface/50, text-danger/80, etc.
        'bg-base':           'rgb(var(--bg-base) / <alpha-value>)',
        'surface':           'rgb(var(--bg-surface) / <alpha-value>)',
        'surface-elevated':  'rgb(var(--bg-surface-elevated) / <alpha-value>)',
        'bg-input':          'rgb(var(--bg-input) / <alpha-value>)',
        'border-default':    'rgb(var(--border-default) / <alpha-value>)',
        'border-strong':     'rgb(var(--border-strong) / <alpha-value>)',
        // Prefijo "ink-" (no "text-") a propósito: evita colisión con las
        // claves preexistentes primary/secondary/muted (ver MIGRATION_LOG.md).
        'ink-primary':       'rgb(var(--text-primary) / <alpha-value>)',
        'ink-secondary':     'rgb(var(--text-secondary) / <alpha-value>)',
        'ink-tertiary':      'rgb(var(--text-tertiary) / <alpha-value>)',
        'ink-muted':         'rgb(var(--text-muted) / <alpha-value>)',
        'brand':             'rgb(var(--accent) / <alpha-value>)',
        'brand-fg':          'rgb(var(--accent-fg) / <alpha-value>)',
        success:             'rgb(var(--success) / <alpha-value>)',
        'success-fg':        'rgb(var(--success-fg) / <alpha-value>)',
        info:                'rgb(var(--info) / <alpha-value>)',
        'info-fg':           'rgb(var(--info-fg) / <alpha-value>)',
        danger:              'rgb(var(--danger) / <alpha-value>)',
        'danger-fg':         'rgb(var(--danger-fg) / <alpha-value>)',
        // ── Tokens fijos (sin modo claro/oscuro) ────────────────────────────
        warning: "#F5A524",
        muted: {
          DEFAULT: "#313136",
          foreground: "#888888",
        },
        card: "#27272A",
        enerman: {
          gold:    "#F5A623",
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
        "glow-gold": "0 0 16px rgba(245, 166, 35, 0.40), 0 0 0 3px rgba(245, 166, 35, 0.20)",
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

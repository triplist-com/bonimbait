import type { Config } from "tailwindcss";
import { COLOR_SCALES } from "./lib/design/tokens";

/**
 * Tailwind theme for the owner brand. Every colour reads a CSS variable from
 * app/globals.css (values mirrored in lib/design/tokens.ts), so opacity
 * modifiers work (`bg-primary/10`) and a re-theme never touches markup.
 *
 * Legacy names reskin automatically:
 *   primary-*    blue  -> brand magenta
 *   secondary-*  amber -> brand ink (the owner's second colour is black)
 *   gray-*, neutral-*  -> warm ink neutrals
 * New code uses primary / ink / sand / success / warning / danger / info.
 * See docs/platform/DESIGN_SYSTEM.md.
 */

const v = (name: string) => `rgb(var(--bb-${name}) / <alpha-value>)`;

function scale(name: keyof typeof COLOR_SCALES, defaultStep?: string) {
  const out: Record<string, string> = {};
  for (const step of Object.keys(COLOR_SCALES[name])) out[step] = v(`${name}-${step}`);
  if (defaultStep) out.DEFAULT = v(`${name}-${defaultStep}`);
  return out;
}

const inkScale = scale("ink", "900");

/**
 * Text-only overrides for AA contrast (backgrounds and borders keep the exact
 * brand colours):
 * - text-primary is primary-700: the logo magenta (600) is 4.55:1 on white
 *   but only ~4.2:1 on paper/sand; 700 is 5.5:1 on both.
 * - legacy text-gray-400 / text-neutral-400 are ink-500 (4.9:1): the old
 *   template used them for small text.
 */
const legacyText = { ...inkScale, 400: v("ink-500") };

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: scale("primary", "600"),
        ink: inkScale,
        sand: scale("sand", "100"),
        success: scale("success", "600"),
        warning: scale("warning", "500"),
        danger: scale("danger", "600"),
        info: scale("info", "600"),
        // Legacy aliases (pre-brand markup keeps working, now on-brand).
        secondary: inkScale,
        gray: inkScale,
        neutral: inkScale,
        surface: {
          DEFAULT: v("surface"),
          50: v("ink-50"),
          100: v("ink-100"),
          200: v("ink-200"),
          sunken: v("surface-sunken"),
        },
        paper: v("paper"),
        background: v("paper"),
        line: { DEFAULT: v("line"), subtle: v("line-subtle") },
        // Third-party brand colour (WhatsApp); dark text on it for AA contrast.
        whatsapp: { DEFAULT: "#25D366", bubble: "#DCF8C6" },
      },
      textColor: {
        primary: { ...scale("primary"), DEFAULT: v("primary-700") },
        gray: legacyText,
        neutral: legacyText,
      },
      fontFamily: {
        heebo: ["var(--font-heebo)", "Heebo", "Arial", "sans-serif"],
        sans: ["var(--font-heebo)", "Heebo", "Arial", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        // Type scale: display / headline / title / body / caption.
        "display-xl": ["clamp(2.5rem, 1.55rem + 4.1vw, 4.5rem)", { lineHeight: "1.04", letterSpacing: "-0.03em", fontWeight: "800" }],
        display: ["clamp(2.25rem, 1.6rem + 2.8vw, 3.5rem)", { lineHeight: "1.08", letterSpacing: "-0.025em", fontWeight: "800" }],
        headline: ["clamp(1.75rem, 1.4rem + 1.5vw, 2.5rem)", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "800" }],
        "headline-sm": ["clamp(1.5rem, 1.3rem + 0.9vw, 1.875rem)", { lineHeight: "1.2", letterSpacing: "-0.015em", fontWeight: "800" }],
        "title-lg": ["1.375rem", { lineHeight: "1.35", fontWeight: "700" }],
        title: ["1.125rem", { lineHeight: "1.4", fontWeight: "700" }],
        "title-sm": ["1rem", { lineHeight: "1.45", fontWeight: "700" }],
        "body-lg": ["1.1875rem", { lineHeight: "1.75" }],
        body: ["1rem", { lineHeight: "1.75" }],
        "body-sm": ["0.9375rem", { lineHeight: "1.65" }],
        caption: ["0.8125rem", { lineHeight: "1.45" }],
      },
      borderRadius: {
        xs: "var(--bb-radius-xs)",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
        card: "var(--bb-radius-lg)",
        control: "var(--bb-radius-md)",
        panel: "var(--bb-radius-xl)",
      },
      boxShadow: {
        xs: "var(--bb-shadow-xs)",
        card: "var(--bb-shadow-card)",
        "card-hover": "var(--bb-shadow-card-hover)",
        lift: "var(--bb-shadow-lift)",
        dialog: "var(--bb-shadow-dialog)",
        brand: "var(--bb-shadow-brand)",
        search: "0 12px 32px -12px rgb(230 21 89 / 0.28), 0 2px 8px -2px rgb(35 31 32 / 0.08)",
        glow: "0 0 0 4px rgb(230 21 89 / 0.14)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
        fast: "150ms",
        slow: "300ms",
        slower: "500ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0, 1)",
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
        in: "cubic-bezier(0.7, 0, 0.84, 0)",
      },
      maxWidth: {
        container: "80rem",
        prose: "42rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        // Sheets slide in from a logical edge; RTL flips via [dir] in components.
        "sheet-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "sheet-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "sheet-in-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "question-in": {
          from: { opacity: "0", transform: "translateY(60%)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-dot": {
          "0%, 80%, 100%": { transform: "scale(0)" },
          "40%": { transform: "scale(1)" },
        },
        "ping-soft": {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "sheet-in-left": "sheet-in-left 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
        "sheet-in-right": "sheet-in-right 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
        "sheet-in-bottom": "sheet-in-bottom 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
        "question-in": "question-in 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 1.8s infinite linear",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite both",
        "ping-soft": "ping-soft 2.4s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Polymarket-inspired palette (dark neon)
        background: {
          DEFAULT: "#0B0E13",
          subtle: "#11161F",
          card: "#1A2230",
          elevated: "#222C3D",
        },
        foreground: {
          DEFAULT: "#FFFFFF",
          muted: "#A6B0C3",
          dim: "#5C6779",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.08)",
          strong: "rgba(255,255,255,0.16)",
        },
        accent: {
          DEFAULT: "#2D9CDB",
          glow: "#3FB6FF",
        },
        yes: {
          DEFAULT: "#27AE60",
          glow: "#3DD884",
          soft: "rgba(39,174,96,0.16)",
        },
        no: {
          DEFAULT: "#EB5757",
          glow: "#FF7373",
          soft: "rgba(235,87,87,0.16)",
        },
        warn: "#F2C94C",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-geist-mono)", "ui-monospace"],
      },
      boxShadow: {
        neon: "0 0 24px rgba(63,182,255,0.35), 0 0 48px rgba(63,182,255,0.15)",
        "neon-yes":
          "0 0 24px rgba(61,216,132,0.35), 0 0 48px rgba(61,216,132,0.15)",
        "neon-no":
          "0 0 24px rgba(255,115,115,0.35), 0 0 48px rgba(255,115,115,0.15)",
        glass: "inset 0 1px 0 rgba(255,255,255,0.06)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        "radial-glow":
          "radial-gradient(800px circle at 50% -20%, rgba(45,156,219,0.25), transparent 60%)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "caret-blink": {
          "0%, 100%": { opacity: "0" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "caret-blink": "caret-blink 1s step-end infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;

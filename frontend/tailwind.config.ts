import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        pine: "rgb(var(--color-pine) / <alpha-value>)",
        "pine-dark": "rgb(var(--color-pine-dark) / <alpha-value>)",
        brass: "rgb(var(--color-brass) / <alpha-value>)",
        rust: "rgb(var(--color-rust) / <alpha-value>)",
        sky: "rgb(var(--color-sky) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "monospace"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "0 18px 50px rgb(54 44 35 / 0.10)",
        "soft-line": "inset 0 1px 0 rgb(255 252 246 / 0.76)",
      },
      keyframes: {
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "typing-pulse": {
          "0%, 80%, 100%": { opacity: "0.28", transform: "translateY(0)" },
          "40%": { opacity: "1", transform: "translateY(-3px)" },
        },
      },
      animation: {
        "rise-in": "rise-in 180ms ease-out both",
        "typing-pulse": "typing-pulse 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

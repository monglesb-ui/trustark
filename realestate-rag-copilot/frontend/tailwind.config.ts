import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        moss: "rgb(var(--color-moss) / <alpha-value>)",
        brass: "rgb(var(--color-brass) / <alpha-value>)",
        clay: "rgb(var(--color-clay) / <alpha-value>)",
        mint: "rgb(var(--color-mint) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        serif: ["var(--font-serif)", "Georgia", "serif"]
      },
      boxShadow: {
        panel: "0 18px 45px rgba(31, 37, 35, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;

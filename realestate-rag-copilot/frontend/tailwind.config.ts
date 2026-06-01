import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2523",
        paper: "#f7f4ec",
        moss: "#2f6f61",
        brass: "#b8892f",
        clay: "#b8583b",
        mint: "#dbe9df"
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

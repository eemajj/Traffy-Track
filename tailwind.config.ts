import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#11251d",
        bg: "#f5faf7",
        surface: "#eaf4ef",
        "surface-strong": "#dbeae2",
        brand: "#00744b",
        "brand-deep": "#005f3e",
        accent: "#63c9a2",
        border: "#c6d9cf",
        muted: "#526b61",
        success: "#2f7d4e",
        warning: "#94550b",
        danger: "#b13a3a"
      },
      fontFamily: {
        sans: ["IBM Plex Sans Thai", "IBM Plex Sans", "Noto Sans Thai", "system-ui", "sans-serif"]
      },
      boxShadow: {
        panel: "0 2px 8px rgba(0, 75, 48, 0.08)",
        hover: "0 2px 8px rgba(0, 75, 48, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;

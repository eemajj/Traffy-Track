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
        ink: "#162033",
        bg: "#f7f9fc",
        surface: "#eef3f8",
        "surface-strong": "#e2eaf3",
        brand: "#3659b8",
        "brand-deep": "#2a448e",
        accent: "#7fa7ff",
        border: "#ccd6e3",
        muted: "#5b6b84",
        success: "#1f7a5a",
        warning: "#c98322",
        danger: "#b13a3a"
      },
      fontFamily: {
        sans: ["IBM Plex Sans Thai", "IBM Plex Sans", "Noto Sans Thai", "system-ui", "sans-serif"]
      },
      boxShadow: {
        panel: "0 18px 40px rgba(34, 58, 110, 0.10)",
        hover: "0 10px 24px rgba(34, 58, 110, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

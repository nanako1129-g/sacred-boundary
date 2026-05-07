import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        torii: "#D24A2E",
        washi: "#F8F1E5",
        "indigo-deep": "#1F2A44",
        "gold-soft": "#C8A96B",
      },
      backgroundImage: {
        "washi-texture":
          "radial-gradient(circle at 10% 20%, rgba(255,255,255,0.35) 0 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(150,120,80,0.08) 0 1px, transparent 1px)",
      },
      boxShadow: {
        ema: "0 10px 22px -14px rgba(31,42,68,0.45), 0 4px 10px -6px rgba(210,74,46,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;

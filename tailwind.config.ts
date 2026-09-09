import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/pages/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}", "./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172231",
        muted: "#708090",
        canvas: "#f5f7fa",
        line: "#e7ebf0",
        brand: "#176b87",
        "brand-dark": "#0e4e64",
        "brand-soft": "#e6f3f6",
        coral: "#ef8f70",
        amber: "#f3b74b",
      },
      boxShadow: {
        card: "0 12px 32px rgba(23, 34, 49, 0.06)",
      },
      borderRadius: {
        xl: "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
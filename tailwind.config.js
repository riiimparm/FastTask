/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        appbg: "#F5F5F7",
        ink: "#1D1D1F",
        subink: "#6E6E73",
        accent: "#007AFF",
        ok: "#34C759",
        warn: "#FF9500",
        danger: "#FF3B30",
      },
      fontFamily: {
        sf: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Helvetica Neue",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.08)",
        cardHover: "0 4px 12px rgba(0,0,0,0.10)",
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};

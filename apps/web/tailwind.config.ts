import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "gr-navy": "var(--gr-navy)",
        "gr-navy-light": "var(--gr-navy-light)",
        "gr-teal": "var(--gr-teal)",
        "gr-teal-dark": "var(--gr-teal-dark)",
        bg: "var(--bg)",
        surface: "var(--surface)",
        "border-color": "var(--border)",
        "text-primary": "var(--text)",
        "text-secondary": "var(--text-2)",
        "text-muted": "var(--text-muted)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: [
          "var(--font-montserrat)",
          "var(--font-inter)",
          "system-ui",
          "sans-serif",
        ],
        serif: ["var(--font-instrument-serif)", "serif"],
      },
      width: {
        sidebar: "232px",
      },
      minWidth: {
        sidebar: "232px",
      },
    },
  },
  plugins: [],
};

export default config;

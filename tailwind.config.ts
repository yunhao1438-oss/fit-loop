import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#26262A",
          soft: "#5B5B63",
          // 原 #8E8E96 在 paper #FBF9F6 上仅 3.09:1（WCAG AA 正文需 4.5:1），
          // 该色用于 11-13px 正文（68 处），故加深到 5.03:1；仍保持低对比的次要语气。
          faint: "#6B6B73",
        },
        paper: {
          DEFAULT: "#FBF9F6",
          card: "#FFFFFF",
          line: "#ECE7E0",
        },
        moss: {
          50: "#EEF5F2",
          100: "#D8E8E2",
          300: "#93C0B3",
          500: "#4F8C7B",
          600: "#3F7867",
          700: "#33604F",
        },
        clay: {
          50: "#FDF1EB",
          100: "#F9DDCE",
          500: "#E08155",
          // 原 #C96B41 在 paper 上 3.53:1，作为小号文字不达标 → 4.95:1
          600: "#A8562F",
        },
        // 以下两个既作小号文字（text-warn/text-alert）又作底色（bg-warn/bg-alert + 白字），
        // 均按「paper 底 4.5:1 以上、白字 4.5:1 以上」取深一档。
        alert: "#B0473E",
        warn: "#8A5C12",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl2: "1.125rem",
      },
      boxShadow: {
        soft: "0 2px 14px rgba(38,38,42,0.06)",
        lift: "0 8px 28px rgba(38,38,42,0.10)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up .22s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;

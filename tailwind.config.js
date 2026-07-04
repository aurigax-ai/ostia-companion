/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Pine Custom Design System Color Tokens (Obsidian Dark Theme)
        pine: {
          bg: '#08090c',
          card: '#111218',
          border: '#1f212a',
          accent: '#a78bfa',
          accentDark: '#4c3e72',
          text: '#e2e4e9',
          muted: '#7f8497',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
        }
      }
    },
  },
  plugins: [],
}

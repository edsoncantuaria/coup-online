/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        medieval: {
          bg: '#F4E7D3', // Parchment
          primary: '#8B0000', // Crimson
          secondary: '#2F4F4F', // Dark Slate Gray
          accent: '#D4AF37', // Gold
        }
      }
    },
  },
  plugins: [],
}

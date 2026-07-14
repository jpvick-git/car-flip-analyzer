/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#142132",
          green: "#2E9D58",
          "green-dark": "#248A4B",
          "green-light": "#E8F7EE",
          bg: "#F0F4F8",
        },
      },
    },
  },
  plugins: [],
}

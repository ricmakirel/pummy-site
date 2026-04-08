/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F5F1E8',
        dark: '#1A1A1A',
        pinkAccent: '#E8A3A3',
        orangeAccent: '#F5C766',
        greenAccent: '#A8D366',
        blueAccent: '#6BA3D4',
        purpleAccent: '#B8A3E8',
      },
      fontFamily: {
        serif: ['Georgia', 'serif'],
      },
      backdropBlur: {
        md: '10px',
      }
    },
  },
  plugins: [],
}

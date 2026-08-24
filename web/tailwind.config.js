/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#d9e5ff', 200: '#bcd1ff', 300: '#8eb2ff',
          400: '#5988fd', 500: '#3563f6', 600: '#2043eb', 700: '#1a34d8',
          800: '#1c2eaf', 900: '#1c2d8a', 950: '#151d54',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

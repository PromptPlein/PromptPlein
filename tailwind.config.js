/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Rijkshuisstijl-geïnspireerd palet (Nederlandse overheid)
        rijksblauw: {
          50: '#eef2fb',
          100: '#d4ddf4',
          200: '#a9bbe9',
          300: '#7e99de',
          400: '#5377d3',
          500: '#154273', // Hoofd-rijksblauw
          600: '#123a66',
          700: '#0e2e51',
          800: '#0a223d',
          900: '#061628',
        },
        rijksrood: '#d52b1e',
        rijksoranje: '#e17000',
        rijksgroen: '#39870c',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-8px)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'fade-out': 'fade-out 0.4s ease-out',
      },
    },
  },
  plugins: [],
};

import {
  rijksblauw,
  rijksoranje,
  rijksoranjeDonker,
  rijksrood,
  rijksgroen,
} from './src/config/brandColors.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Rijkshuisstijl-palet (Nederlandse overheid) — bron: src/config/brandColors.js
        rijksblauw,
        rijksrood,
        // `rijksoranje` blijft als `bg-rijksoranje` werken via DEFAULT;
        // `rijksoranje-dark` voor hover/gradient-einde.
        rijksoranje: { DEFAULT: rijksoranje, dark: rijksoranjeDonker },
        rijksgroen,
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
        // Onbepaalde voortgangsbalk: schuift heen en weer over de volle breedte.
        'loading-bar': {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(150%)' },
          '100%': { transform: 'translateX(450%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'fade-out': 'fade-out 0.4s ease-out',
        'loading-bar': 'loading-bar 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

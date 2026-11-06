import {
  rijksblauw,
  rijksoranje,
  rijksoranjeDonker,
  rijksrood,
  rijksgroen,
  accentDonker,
  accentDonkerHover,
} from './src/config/brandColors.js';
import plugin from 'tailwindcss/plugin';

/** '#e17000' wordt '225 112 0', de vorm die rgb(var() / alpha) verwacht. */
const rgbTriplet = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};

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
        // `rijksoranje-dark` voor hover/gradient-einde. Via een CSS-variabele,
        // zodat de donkere modus een ander accent krijgt (zie plugin onderaan).
        // `rijksoranje-vast` schakelt niet mee: op lintblauw, dat in beide modi
        // gelijk blijft, haalt alleen het felle oranje de 3:1 van een icoon.
        rijksoranje: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          dark: 'rgb(var(--accent-hover) / <alpha-value>)',
          vast: rijksoranje,
        },
        rijksgroen,
      },
      fontFamily: {
        sans: ['RijksSansVF', 'Fira Sans', 'Arial', 'sans-serif'],
      },
      // Vormtaal van de Rijkshuisstijl: knoppen en velden 0,25rem, kaarten
      // 0,5rem. Via het thema, zodat elke bestaande klasse meegaat.
      borderRadius: {
        DEFAULT: '0.25rem',
        md: '0.25rem',
        lg: '0.25rem',
        xl: '0.5rem',
        '2xl': '0.5rem',
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
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': {
          '--accent': rgbTriplet(rijksoranje),
          '--accent-hover': rgbTriplet(rijksoranjeDonker),
        },
        'html.dark': {
          '--accent': rgbTriplet(accentDonker),
          '--accent-hover': rgbTriplet(accentDonkerHover),
        },
      });
    }),
  ],
};

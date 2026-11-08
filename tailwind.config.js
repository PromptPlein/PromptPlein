import {
  rijksblauw,
  nadruk,
  nadrukKnop,
  nadrukHover,
  nadrukTekst,
  nadrukTekstDonker,
  nadrukOpBlauw,
  rijksrood,
  rijksgroen,
} from './src/config/brandColors.js';
import plugin from 'tailwindcss/plugin';

/** '#e17000' wordt '225 112 0', de vorm die rgb(var() / alpha) verwacht. */
const rgbTriplet = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};

/** @type {import('tailwindcss').Config} */
export default {
  // Na een tik blijft een hover-kleur anders plakken tot je ergens anders tikt.
  future: { hoverOnlyWhenSupported: true },
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Rijkshuisstijl-palet (Nederlandse overheid) — bron: src/config/brandColors.js
        rijksblauw,
        rijksrood,
        // Accentkleur (bron: src/config/brandColors.js). DEFAULT voor vlakken,
        // strepen en randen; `nadruk-knop` voor een vlak met witte tekst,
        // `nadruk-dark` voor de hover daarvan; `nadruk-vast` voor op lintblauw
        // (menubalk, blauwe knoppen) en schakelt niet mee met de donkere modus.
        // Tekst, iconen, vinkjes en svg-vulling volgen hieronder --accent-tekst,
        // die in de donkere modus lichter wordt.
        nadruk: {
          DEFAULT: nadruk,
          knop: nadrukKnop,
          dark: nadrukHover,
          vast: nadrukOpBlauw,
        },
        rijksgroen,
      },
      fontFamily: {
        sans: ['RijksSansVF', 'Fira Sans', 'Arial', 'sans-serif'],
      },
      // Zwakke tekst haalt in beide modi 4,5:1 op elk vlak. De gewone slate-400
      // en slate-500 halen dat niet: 2,6:1 op wit en 3,8:1 op donker. Alleen de
      // tekstkleur volgt deze token; randen en vlakken houden de echte tint.
      textColor: {
        slate: {
          400: 'rgb(var(--tekst-400) / <alpha-value>)',
          500: 'rgb(var(--tekst-500) / <alpha-value>)',
        },
        nadruk: { DEFAULT: 'rgb(var(--accent-tekst) / <alpha-value>)' },
      },
      accentColor: {
        nadruk: { DEFAULT: 'rgb(var(--accent-tekst) / <alpha-value>)' },
      },
      fill: {
        nadruk: { DEFAULT: 'rgb(var(--accent-tekst) / <alpha-value>)' },
      },
      placeholderColor: {
        slate: {
          400: 'rgb(var(--tekst-400) / <alpha-value>)',
          500: 'rgb(var(--tekst-500) / <alpha-value>)',
        },
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
    plugin(({ addBase, addVariant }) => {
      // Via addVariant en niet in `screens`: een object in `screens` zet alle
      // max-*-varianten uit, en de telefoonopmaak leunt daarop.
      // Liggende telefoon: breed genoeg voor de desktopopmaak, te laag voor een hoge kop.
      addVariant('laag', '@media (max-height: 31.25rem)');
      // Aanraakscherm: wat bij de muis pas bij aanwijzen verschijnt, staat er hier
      // gewoon. Aanwijzen bestaat niet met een vinger.
      addVariant('opl-geen-muis', '@media (hover: none)');
      addBase({
        ':root': {
          '--accent-tekst': rgbTriplet(nadrukTekst),
          '--tekst-400': rgbTriplet('#566377'),
          '--tekst-500': rgbTriplet('#526075'),
        },
        'html.dark': {
          '--accent-tekst': rgbTriplet(nadrukTekstDonker),
          '--tekst-400': rgbTriplet('#afbccd'),
          '--tekst-500': rgbTriplet('#a3b1c5'),
        },
      });
    }),
  ],
};

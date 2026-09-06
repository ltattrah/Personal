import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Muted palette inspired by kente tones; kept low-saturation for readability.
        gold: { 50: '#fdf8e7', 100: '#f9ecb8', 500: '#c99a12', 700: '#8d6a08' },
        forest: { 50: '#eef6f0', 100: '#d3e8d9', 500: '#2f7d4f', 700: '#1f5636', 900: '#12321f' },
        clay: { 500: '#b5452b', 700: '#8a331f' },
      },
    },
  },
  plugins: [],
};
export default config;

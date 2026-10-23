/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Odin V2 palette: black, graphite, orange
        odin: {
          black: '#0a0a0a',
          graphite: {
            50: '#f0f0f0',
            100: '#e0e0e0',
            200: '#c8c8c8',
            300: '#a8a8a8',
            400: '#888888',
            500: '#686868',
            600: '#505050',
            700: '#383838',
            800: '#282828',
            900: '#181818',
            950: '#0f0f0f',
          },
          orange: {
            50: '#fff4ed',
            100: '#ffe8d1',
            200: '#ffd1a3',
            300: '#ffae6b',
            400: '#ff8c38',
            500: '#ff6b00',  // Primary orange
            600: '#e05600',
            700: '#b84200',
            800: '#903300',
            900: '#732a00',
            950: '#3d1500',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
    },
  },
  plugins: [],
}
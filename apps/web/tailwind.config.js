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
        // Odin V2 Design System Palette (from DESIGN.md - Dala style)
        odin: {
          // Base surfaces - pure black only
          black: '#000000',
          graphite: {
            50: '#f5f5f5',
            100: '#e8e8e8',
            200: '#d4d4d4',
            300: '#bdbdbd',   // Silver Mist - tertiary text
            400: '#9a9a9a',   // Ash Gray - secondary text
            500: '#757575',
            600: '#616161',
            700: '#424242',
            800: '#2d2d2d',   // Subtle borders only when needed
            900: '#1a1a1a',
            950: '#0d0d0d',
          },
          // Primary action - Electric Iris
          violet: {
            50: '#f3f0ff',
            100: '#e8e0ff',
            200: '#d1c4ff',
            300: '#b39dff',
            400: '#9675ff',
            500: '#8052ff',   // PRIMARY ACTION - Electric Iris
            600: '#6d42e6',
            700: '#5a35c9',
            800: '#4a2da8',
            900: '#3e2787',
            950: '#2a1a63',
          },
          // Emphasis/Attention - Saffron Spark
          amber: {
            50: '#fffbeb',
            100: '#fef3c7',
            200: '#fde68a',
            300: '#fcd34d',
            400: '#fbbf24',
            500: '#ffb829',   // EMPHASIS/ATTENTION - Saffron Spark
            600: '#e6a323',
            700: '#cc8d1e',
            800: '#a8711b',
            900: '#885a1a',
            950: '#4a2f0d',
          },
          // Success/Positive - Deep Verdant
          emerald: {
            50: '#ecfdf5',
            100: '#d1fae5',
            200: '#a7f3d0',
            300: '#6ee7b7',
            400: '#34d399',
            500: '#15846e',   // GREEN ACCENT - Deep Verdant
            600: '#12705e',
            700: '#0f5c4c',
            800: '#0c4a3d',
            900: '#0a3d32',
            950: '#05261e',
          },
          // Error/Critical
          crimson: {
            50: '#fef2f2',
            100: '#fee2e2',
            200: '#fecaca',
            300: '#fca5a5',
            400: '#f87171',
            500: '#ef4444',
            600: '#dc2626',
            700: '#b91c1c',
            800: '#991b1b',
            900: '#7f1d1d',
            950: '#450a0a',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        // Design system type scale (from DESIGN.md - adapted for dashboard density)
        'display': ['113px', { lineHeight: '1.1', letterSpacing: '-4.52px', fontWeight: '400' }],
        'heading-lg': ['78px', { lineHeight: '1.1', letterSpacing: '-3.12px', fontWeight: '400' }],
        'heading': ['48px', { lineHeight: '1.1', letterSpacing: '-1.68px', fontWeight: '400' }],
        'heading-sm': ['42px', { lineHeight: '1.2', letterSpacing: '-1.68px', fontWeight: '400' }],
        'subheading': ['36px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '400' }],
        'heading-xs': ['27px', { lineHeight: '1.0', letterSpacing: '0', fontWeight: '400' }],
        'heading-2xs': ['24px', { lineHeight: '1.25', letterSpacing: '-0.48px', fontWeight: '400' }],
        'body': ['18px', { lineHeight: '1.5', fontWeight: '300' }], // Weight 300 as fallback for 200
        'body-sm': ['15px', { lineHeight: '1.5', fontWeight: '300' }],
        'nav-label': ['14px', { lineHeight: '1.2', letterSpacing: '0.35px', fontWeight: '600', textTransform: 'uppercase' }],
        'caption': ['12px', { lineHeight: '1.5', fontWeight: '400' }],
        'code': ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        'code-sm': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      spacing: {
        // 6px base unit scale (from DESIGN.md)
        '0': '0',
        '1': '0.25rem',   // 4px
        '1.5': '0.375rem', // 6px - BASE UNIT
        '2': '0.5rem',    // 8px
        '3': '0.75rem',   // 12px = 2 * 6px
        '4': '1rem',      // 16px
        '5': '1.25rem',   // 20px
        '6': '1.5rem',    // 24px = 4 * 6px
        '7': '1.75rem',   // 28px
        '8': '2rem',      // 32px
        '9': '2.25rem',   // 36px = 6 * 6px
        '10': '2.5rem',   // 40px
        '12': '3rem',     // 48px = 8 * 6px
        '14': '3.5rem',   // 56px
        '16': '4rem',     // 64px
        '18': '4.5rem',   // 72px
        '20': '5rem',     // 80px
        '24': '6rem',     // 96px = 16 * 6px
      },
      borderRadius: {
        'none': '0',
        'sm': '0.25rem',   // 4px
        'DEFAULT': '0.375rem', // 6px
        'md': '0.5rem',    // 8px
        'lg': '0.75rem',   // 12px
        'xl': '1rem',      // 16px
        '2xl': '1.5rem',   // 24px - REFERENCE RADIUS (from DESIGN.md)
        '3xl': '2rem',     // 32px
        'full': '9999px',
      },
      boxShadow: {
        // No shadows per DESIGN.md - "Dala uses no shadows or elevation"
        'none': 'none',
      },
      transitionDuration: {
        'fast': '100ms',
        'DEFAULT': '200ms',
        'slow': '300ms',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
        'ease-in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-out': 'fadeOut 150ms ease-in',
        'slide-up': 'slideUp 300ms ease-out-expo',
        'slide-down': 'slideDown 300ms ease-out-expo',
        'scale-in': 'scaleIn 200ms ease-out-expo',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
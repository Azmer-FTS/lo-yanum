/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Rubik', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Brand: desert night — deep indigo for the "watchman" identity,
        // sand tones for surfaces.
        night: {
          50: '#f2f4fb',
          100: '#e4e8f6',
          200: '#c9d2ed',
          300: '#a2b1de',
          400: '#7488cb',
          500: '#5366b8',
          600: '#414f9c',
          700: '#36407e',
          800: '#303869',
          900: '#2b3158',
          950: '#1c2038',
        },
        sand: {
          50: '#fbf9f5',
          100: '#f4f0e7',
          200: '#e8dfcd',
          300: '#d8c8a9',
          400: '#c5ab80',
          500: '#b79463',
          600: '#aa8157',
          700: '#8d6949',
          800: '#735640',
          900: '#5e4837',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 32, 56, 0.04), 0 4px 16px rgba(28, 32, 56, 0.06)',
        lift: '0 2px 4px rgba(28, 32, 56, 0.06), 0 12px 32px rgba(28, 32, 56, 0.10)',
      },
      screens: {
        xs: '390px',
      },
    },
  },
  plugins: [],
}

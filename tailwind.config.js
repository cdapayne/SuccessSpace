/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './public/assets/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)'
      }
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{ts,tsx}',
    './content/**/*.{md,mdx}',
    '../../node_modules/fumadocs-ui/dist/**/*.js',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

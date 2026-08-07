/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Brand colors. The CSS variables are defined in globals.css
      // (:root{--primary:#4f46e5;--primary-hover:#4338ca}) and referenced by the
      // utility classes used across Button / Topbar / form accents. Without
      // this mapping, classes like `bg-primary` were silently dropped by
      // Tailwind, leaving primary buttons with no background (invisible on a
      // white header).
      colors: {
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
      },
    },
  },
  plugins: [],
};

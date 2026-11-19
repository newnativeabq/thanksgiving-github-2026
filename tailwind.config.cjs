const color = name => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./index.html', './hub.js'],
  theme: {
    extend: {
      colors: {
        parchment: color('page'),
        linen: color('surface'),
        warmborder: color('border'),
        accent: {
          DEFAULT: color('accent'),
          dark: color('accent-dark'),
          light: color('accent-light'),
        },
        positive: {
          DEFAULT: color('positive'),
          dark: color('positive-dark'),
          light: color('positive-light'),
        },
        warning: {
          DEFAULT: color('warning'),
          dark: color('warning-dark'),
          light: color('warning-light'),
        },
        ink: {
          DEFAULT: color('ink'),
          muted: color('muted'),
          subtle: color('subtle'),
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        warm: '0 1px 2px rgb(32 31 28 / 5%)',
        'warm-lg': '0 12px 30px rgb(32 31 28 / 14%)',
      },
    },
  },
};

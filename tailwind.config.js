/** @type {import('tailwindcss').Config} */
// nguyen0xhieu brand tokens — from tokens.json
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // nguyen0xhieu tokens — values live in src/index.css (light + dark)
        blue:        { DEFAULT: 'var(--blue)', strong: 'var(--blue-strong)', soft: 'var(--blue-soft)' },
        'on-blue':   'var(--on-blue)',
        ink:    'var(--ink)',
        grey:   'var(--grey)',
        muted:  'var(--muted)',
        ground: 'var(--ground)',
        mist:   'var(--mist)',
        line:   'var(--line)',
        scrim:  'var(--scrim)',
        green:  { DEFAULT: 'var(--green)',  text: 'var(--green-text)',  soft: 'var(--green-soft)' },
        red:    { DEFAULT: 'var(--red)',    text: 'var(--red-text)',    soft: 'var(--red-soft)' },
        yellow: { DEFAULT: 'var(--yellow)', text: 'var(--yellow-text)', soft: 'var(--yellow-soft)' },
        orange: { DEFAULT: 'var(--orange)', text: 'var(--orange-text)', soft: 'var(--orange-soft)' },
      },
      fontFamily: {
        app: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // App type scale (px / line-height / letter-spacing)
        'app-caption':  ['14px', { lineHeight: '20px', letterSpacing: '-0.006em', fontWeight: '400' }],
        'app-label':    ['14px', { lineHeight: '20px', letterSpacing: '-0.006em', fontWeight: '600' }],
        'app-note':     ['16px', { lineHeight: '24px', letterSpacing: '-0.011em', fontWeight: '400' }],
        'app-secondary':['18px', { lineHeight: '24px', letterSpacing: '-0.014em', fontWeight: '400' }],
        'app-btn-sm':   ['18px', { lineHeight: '24px', letterSpacing: '-0.014em', fontWeight: '600' }],
        'app-body':     ['22px', { lineHeight: '28px', letterSpacing: '-0.018em', fontWeight: '400' }],
        'app-button':   ['22px', { lineHeight: '28px', letterSpacing: '-0.018em', fontWeight: '600' }],
        'app-title-card':['22px',{ lineHeight: '28px', letterSpacing: '-0.018em', fontWeight: '600' }],
        'app-title-screen':['28px',{ lineHeight: '36px', letterSpacing: '-0.021em', fontWeight: '600' }],
        'app-large-title':['34px',{ lineHeight: '40px', letterSpacing: '-0.022em', fontWeight: '700' }],
        'app-number':   ['48px', { lineHeight: '56px', letterSpacing: '-0.022em', fontWeight: '700' }],
      },
      borderRadius: {
        md:   '16px',
        '32': '32px',
        pill: '9999px',
      },
      boxShadow: {
        'y2': 'var(--shadow-y2)',
      },
      spacing: {
        // brand spacing tokens (all multiples of 8)
        '18': '72px',  // 9×8 — for nav bar height
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(to top right, #0F3DB2, #1E6DF7)',
      },
    },
  },
  plugins: [],
}

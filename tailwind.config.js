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
        // Brand blue
        blue:        { DEFAULT: '#1E6DF7', strong: '#0F3DB2', soft: '#E8F0FE' },
        'on-blue':   '#FFFFFF',
        // Gradient
        'grad-start': '#1E6DF7',
        'grad-end':   '#0F3DB2',
        // Text / surface
        ink:    '#000000',
        grey:   '#4B5568',
        muted:  '#8B95A8',
        ground: '#FFFFFF',
        mist:   '#ECF0F8',
        line:   '#DCE3EE',
        scrim:  'rgba(0,0,0,0.48)',
        // Accent
        green:  { DEFAULT: '#0F9D58', text: '#0B7A45', soft: '#E3F5EC' },
        red:    { DEFAULT: '#E0344A', text: '#C42B3F', soft: '#FDE8EB' },
        purple: { DEFAULT: '#7B4DF2', text: '#6A3CE6', soft: '#EFE9FE' },
        yellow: { DEFAULT: '#F5B301', text: '#8A5F00', soft: '#FEF5D9' },
        orange: { DEFAULT: '#F06A1D', text: '#B84A0C', soft: '#FDEDE3' },
        cyan:   { DEFAULT: '#0EA5C6', text: '#087089', soft: '#E0F5FA' },
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
        'y2': '0 1px 2px 0 rgba(15,23,42,0.06), 0 8px 24px 0 rgba(15,61,178,0.08)',
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

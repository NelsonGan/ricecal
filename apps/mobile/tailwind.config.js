/**
 * Colour roles resolve through CSS custom properties defined in global.css,
 * which is generated from src/theme/tokens.ts. That indirection is what lets
 * `bg-surface` mean white in light mode and #1A2220 in dark without writing a
 * `dark:` prefix on every element in the app.
 *
 * `<alpha-value>` keeps modifiers working, so `bg-pandan/20` still resolves.
 */
const role = (name) => `rgb(var(--color-${name}) / <alpha-value>)`

// The numeric scales are duplicated from src/theme/tokens.ts because a Tailwind
// config is CommonJS and cannot import TypeScript. src/theme/__tests__/tokens.test.ts
// fails if the two ever disagree.
const spacing = {
  xs: '4px',
  sm: '8px',
  md: '14px',
  lg: '22px',
  xl: '32px',
  gutter: '20px',
  card: '20px',
  stack: '14px',
}

const radius = {
  sm: '14px',
  md: '20px',
  tile: '22px',
  sheet: '24px',
  card: '28px',
  full: '999px',
}

const hitSize = {
  sm: '44px',
  md: '56px',
  lg: '64px',
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', '../../packages/**/src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // `darkMode` is deliberately left at NativeWind's default. Setting it to
  // 'class' stops the runtime from following the OS appearance at all, and it
  // only governs how `dark:` variants compile — which this system never writes,
  // because ThemeProvider swaps the whole palette instead.
  theme: {
    extend: {
      colors: {
        canvas: role('canvas'),
        surface: role('surface'),
        'surface-alt': role('surface-alt'),
        inverse: role('inverse'),
        'on-inverse': role('on-inverse'),
        'inverse-accent': role('inverse-accent'),

        line: role('line'),
        track: role('track'),
        'line-strong': role('line-strong'),

        ink: role('ink'),
        heading: role('heading'),
        body: role('body'),
        muted: role('muted'),
        faint: role('faint'),

        disabled: role('disabled'),
        'disabled-slab': role('disabled-slab'),
        'on-disabled': role('on-disabled'),

        pandan: {
          DEFAULT: role('pandan'),
          slab: role('pandan-slab'),
          soft: role('pandan-soft'),
          'soft-line': role('pandan-soft-line'),
          ink: role('pandan-ink'),
        },
        hibiscus: {
          DEFAULT: role('hibiscus'),
          slab: role('hibiscus-slab'),
          soft: role('hibiscus-soft'),
          'soft-line': role('hibiscus-soft-line'),
          ink: role('hibiscus-ink'),
        },
        kaya: {
          DEFAULT: role('kaya'),
          slab: role('kaya-slab'),
          soft: role('kaya-soft'),
          'soft-line': role('kaya-soft-line'),
          ink: role('kaya-ink'),
        },
        water: {
          DEFAULT: role('water'),
          slab: role('water-slab'),
          soft: role('water-soft'),
          'soft-line': role('water-soft-line'),
          ink: role('water-ink'),
        },
        teh: {
          DEFAULT: role('teh'),
          slab: role('teh-slab'),
        },

        'on-pandan': role('on-pandan'),
        'on-hibiscus': role('on-hibiscus'),
        'on-kaya': role('on-kaya'),
        'on-water': role('on-water'),
      },
      // One family per weight. React Native does not synthesise weights from a
      // single file the way a browser does, so `font-display` and `font-body`
      // each name a concrete .ttf registered by src/theme/fonts.ts.
      fontFamily: {
        display: ['Baloo2_800ExtraBold'],
        'display-bold': ['Baloo2_700Bold'],
        body: ['Nunito_400Regular'],
        'body-bold': ['Nunito_700Bold'],
        'body-black': ['Nunito_800ExtraBold'],
      },
      spacing,
      borderRadius: radius,
      minHeight: hitSize,
      minWidth: hitSize,
    },
  },
  plugins: [],
}

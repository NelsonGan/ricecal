# RiceCal design system

An implementation of the Beratt design system: a soft, squishy visual language
for Malaysian eating. English interface, Malay food names, cool gray-green
neutrals, and buttons that beg to be pressed.

`app/gallery.tsx` renders every component in every state, in both modes, on a
real device. Nothing links to it — open `/gallery` directly.

## Layers

```
src/theme/tokens.ts        colour roles, spacing, radius, slab depth, motion
src/theme/ThemeProvider    publishes the active palette as CSS variables
src/theme/useTheme         read the scheme, its colours, or set a preference
tailwind.config.js         maps roles to utilities (bg-surface, text-muted, …)
src/ui/cn.ts               class composition where later utilities win
src/ui/Squish.tsx          the press mechanic every raised control shares
src/ui/*.tsx               the components
```

## Conventions

**Import from `@/ui`,** never from a file inside it. The barrel is what lets a
component be split or renamed without touching every screen.

**`className` targets the outer box** — layout, flex, margins — because that is
what the parent measures. `contentClassName` targets the inner surface, and is
rarely needed: appearance belongs to `variant` / `tone`.

**Everything interactive is controlled.** No component owns the value it
displays. That is what lets an optimistic update be rolled back when the server
rejects it, which matters as soon as anything here is wired to Supabase.

**Never write a colour literal.** Use a role (`bg-pandan`, `text-muted`). Roles
resolve per mode automatically; a hex does not. For Skia, charts and other
imperative surfaces, read `useThemeColors()`.

**A number is typed on the app's own pad.** Any `keyboardType` that means a
number — `number-pad`, `decimal-pad`, `numeric` — opens `Numpad` instead of the
system keyboard, and `TextField` arranges that for you. A bare `TextInput` asks
for it with `useNumpadField`, whose result is spread onto the input LAST: it
composes `onFocus` and `onBlur` with the ones you passed in, and the composed
pair has to be the one that reaches the field. See the header in `Numpad.tsx`
for why the platform's own pad stopped being usable.

## Things that will bite you

**Changing `tailwind.config.js` needs a Metro cache clear.** NativeWind caches
the compiled stylesheet, and a stale cache produces an app with *no styling at
all* rather than an error. `npx expo start --clear`.

**Dark mode is not `dark:` variants.** `ThemeProvider` swaps the whole palette
via `vars()`, so the same `bg-surface` means white or `#1A2220` depending on the
mode. A `.dark:root` block in `global.css` does nothing — NativeWind has no
dark-scoped stylesheet root.

**Following the OS needs `userInterfaceStyle: "automatic"` in app.json.** Set to
`"light"`, iOS pins the whole app and `Appearance` reports light on a device in
dark mode.

**Baloo 2 needs line height above its font size.** A browser lets glyphs
overflow their line box; React Native clips them. `lineHeight: 52` on 52px type
shears the top off "1,847".

**The slab is a view, not a shadow.** See the comment in `Squish.tsx` for why.
Its practical consequence: a control's outer box is `depth` taller than its
visible surface, and layout classes belong on the outer box.

**A numeric field needs a `NumpadHost` above it,** and `Screen` and `Sheet` are
the two that provide one. A field outside both keeps the system keyboard rather
than focusing into a pad nobody can draw — which is the right failure, but it
means a numeric field rendered straight into a `Modal` of its own gets the
platform's keyboard back without saying so.

**A sheet hosts its own pad, and that is not redundant.** A `Sheet` is a native
modal window: nothing rendered in the app's tree below it can draw over it, so
the pad opened by a field inside a sheet has to be drawn inside that sheet.
`NumpadHost` picks the nearest host above the field, which is why there is more
than one.

## Icons

484 illustrated icons across five sets — `ui`, `system`, `body`, `food`,
`dishes` — in `assets/icons`, with a generated require map in
`icons.generated.ts`.

```tsx
<Icon set="dishes" name="nasi-lemak" size={44} />
```

`set` narrows `name`, so a typo is a type error rather than a blank square.
They are full-colour illustrations and are not tinted by default; `tintColor`
exists for the few places that need a monochrome treatment.

To re-import them after the source set changes:

```bash
node scripts/sync-icons.mjs
```

That script downscales and quantises (37 MB → 5.7 MB) and needs the design
system checked out at `.secrets/RiceCal Design System`. The processed PNGs are
committed, so CI and EAS never run it.

## Adding a colour role

1. Add it to **both** maps in `src/theme/tokens.ts`.
2. `pnpm theme:gen` to refresh the `:root` fallback in `global.css`.
3. Map it in `tailwind.config.js`.

`src/theme/__tests__/tokens.test.ts` fails if any of the three drift.

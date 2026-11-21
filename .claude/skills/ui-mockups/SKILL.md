---
name: ui-mockups
description: Generate a mockup image of the UI before building or restyling it, then build toward it and check the real UI against it. Use for every visible UI change in RiceCal (an app screen, sheet, card, row, empty state, onboarding or paywall step, a website page or section, an App Studio view) and for every design review or user review of a frontend, where a generated mockup of the same screen is the guide the review compares against. Works with the image-generation skill.
---

# Design from a mockup, then check against it

Going straight from words to code lands on the generic: a centred stack of evenly
weighted cards. An image model has seen far more good interfaces and commits to a
hierarchy, so a generated mockup is usually more coherent than a first build.
Every UI change here starts from one, and the mockup stays the guide until the
change ships: the build is checked against it, and so is every review.

Images come from the **image-generation** skill (`.agents/skills/image-generation`),
which uses whichever image model is available. Read its `SKILL.md` once per
session for the flags and backends.

## When

**Always** when a change alters what a user sees: a new screen, sheet, card, row
or section, a restyle, an empty, loading or error state, onboarding and paywall
steps, a website page or section, an App Studio view. Also for any **design
review** or **user review** of a frontend (below).

**The only exceptions:** nothing visible changes in layout (a copy edit, a bug fix
that restores the existing design, wiring data into an unchanged layout), or the
user supplied the design (a screenshot, a Figma frame, a mockup from an earlier
round of the same PR). Then that design is the guide, and the checking steps
below still apply.

If no image backend works, say so once and carry on without a mockup, holding the
build to the same checks against the existing screens instead. Never stand in an
HTML page or a hand-drawn SVG for the mockup.

## 1. Gather the references

1. Read the rules for the surface: README *The design system* for the app
   (`src/theme/tokens.ts`, the components in `src/ui`, every one rendered at
   `/gallery`), *The website* and its *Where the design comes from* for
   `apps/web`, *The App Studio* → *Design* for the studio. AGENTS.md's *Copy*.
2. Screenshot the screen you are changing, or the nearest existing one when the
   screen is new: a leased device for the app (`simlock-devices`), the dev server
   for the website or the studio. Light mode unless the change is about dark.
3. If there is no device to hand, the current store captures are real app
   screens: `apps/app-studio/public/assets/screenshots-iphone/en/*.png` (Today,
   workout, dish, trends, feed, recipes).

Pass one or two of those with `-i` and say what they are for.

## 2. Generate the mockup

Save mockups for a PR in `.github/pr-assets/<topic>/` (ignored by git), so the
PR description can carry them. `-n 2` writes `mockup-<screen>-1.png` and `-2.png`;
copy the one you build toward to `mockup-<screen>.png`. Exploration that will not
become a PR goes in the scratchpad.

```bash
.agents/skills/image-generation/scripts/generate-image.sh -n 2 \
  -i <current-screen.png> -i <nearest-sibling.png> \
  -o .github/pr-assets/<topic>/mockup-<screen>.png "<brief>"
```

```text
Asset type: high-fidelity UI mockup of one <iPhone app screen | web page at desktop width | web page at phone width>, flat screenshot, no device frame, no hands, no perspective
Product: RiceCal, a calorie tracker built around Asian food; friendly, calm, never telling the user off
Screen: <what this screen is for, what the user does here, the primary action>
Content (use exactly): <real labels, realistic dishes, kcal and grams; sections in priority order>
Visual language: match the attached screenshots exactly (palette, type, corner radius, density). Canvas #F6F8F7, white surfaces, colour only for state and data from pandan green #2FBF71, kaya yellow #FFC145 and hibiscus red #FF4D6D. Rounded type for headings and figures (Baloo 2 ExtraBold), Nunito for body. Radius 14 / 20 / 28 / pill. Cards sit on a solid, unblurred slab rather than a soft drop shadow.
Platform: <iOS: safe areas, the app's tab bar, sheet grabber | Android: same design, Android system bars | web: the site's nav, max content width>
Composition: tall portrait at phone proportions, about 9:19.5 (phone) | landscape 3:2 (web)
Avoid: lorem ipsum, placeholder boxes, watermark, device frame, several screens in one image, em dashes in copy, emoji used as icons
```

- **Real content matters most.** A mockup of fake content is a design for fake
  content. Use the dishes, numbers and states the screen really shows, including
  the awkward ones (a long dish name, zero entries, a target exceeded).
- Two variants (`-n 2`) for new screens and redesigns; one for a small change to
  an existing screen, usually as an edit: `-e -i <current.png> "change only …"`.
- **One feature, one family.** Mock the key screen first, then pass the chosen
  mockup with `-i` when mocking the others, and keep them on the same backend
  (`-b`).
- Generate independent screens in parallel. Look at every image.

When the change is a real design decision (a new screen, a new flow, a redesign)
show the user the mockup and say which variant you are building toward before
writing the code, unless they said to go ahead.

## 3. Write down the guide

Before building, decide in a few bullets what the mockup is teaching. This short
list is the guide the build and every review are checked against.

**Take:** the hierarchy (what is biggest, what comes first), grouping and
sectioning, spacing rhythm and density, how the key figures are featured, the
treatment of the primary action, ideas for empty and edge states, and the small
touches that make it feel finished.

**Leave:**

- exact colours: map them to roles (`bg-pandan`, `text-muted`), never a literal
- fonts and sizes: use the project's type scale
- invented components: build from `@/ui`; a new primitive needs a reason
- invented features, data or navigation: ignore them
- text in the image: often garbled; write the copy under AGENTS.md's *Copy* and
  *Writing* rules, then translate it
- pixel measurements: use the spacing scale in `tokens.ts`

**The project's rules win every conflict with the mockup.** It is direction, not a
spec: deviate wherever the real platform, real data, accessibility, dark mode or
an existing pattern says otherwise, and note the deviation in the guide.

## 4. Build, then check against the guide

After building, screenshot the real UI at the same state as the mockup and put
the two side by side. Go through the guide bullet by bullet:

- Did it keep the hierarchy, grouping and density that made the mockup good, or
  slide back into a generic stack of equal cards?
- Is the primary action as clear as in the mockup?
- Every difference is either fixed or a deliberate deviation you can name.

Then the usual checks: dark mode, a small phone (and the iPhone Duo when layout
depends on width), long text and a long translation, the website at a phone
width, the project's own checklists.

Repeat the loop when a later round changes the same screen: compare with the
mockup in the PR description, or generate a new one if the direction changed,
and say so.

## Design review and user review

Any review of a frontend, whether of a PR, of a screen the user asks about, or a
round of the user's own feedback, uses a mockup as its yardstick:

1. **A mockup exists** (in the PR description or from an earlier round): check the
   built UI against it and its guide, as in step 4.
2. **None exists:** screenshot the UI under review, then generate a mockup of the
   same screen with the same content and features: pass the screenshot with `-i`
   and ask for "a more coherent, polished version of the attached screen, keeping
   every element and feature, the same content and the app's visual language".
3. Compare the two and turn each place where the mockup is clearer into a
   concrete finding: hierarchy, alignment, grouping, density, emphasis, empty
   states. A finding names the element and the change, not "looks cleaner".
4. For a user review, show the user the screenshot and the mockup together, so
   they are reacting to a picture rather than a description, and let them pick
   what to keep before anything is built.

A mockup in a review is evidence for a finding, not a demand to match it pixel
for pixel; the same *Take* and *Leave* rules apply.

## In the PR

Attach the mockup beside the final screenshot in the description, with a line
on what was taken from it and where the build deliberately departs:

```markdown
| Mockup | Built |
|---|---|
| ![Mockup](.github/pr-assets/<topic>/mockup-<screen>.png) | ![After](.github/pr-assets/<topic>/after.png) |
```

and pass both paths to `--attach` (`create-pr` has the rest). Mockups are never
committed, like every other piece of PR evidence.

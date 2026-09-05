---
name: update-whats-new
description: Write the store What's New note for a RiceCal release and open a PR on ricecal-screenshots-creator. Reads the note that is live, finds the ricecal commits it does not cover, and rewrites the note in all 23 listing locales. Use when asked to update the What's New / release notes / store note, or to say what changed in the new version.
---

# What's New

The App Store and Play both show a short note beside a release. Both copies come
from one place: `src/data/appDescriptions.ts` in the sibling repo
`~/Projects/ricecal-screenshots-creator`, where every locale carries a
`whatsNew` string. The Descriptions view uploads it; nothing else writes it.

This skill goes: find where the last note stopped, read the ricecal PRs merged
since, write the note, translate it, verify it, open a PR. It never uploads to
a store. Someone presses that button.

Both repos are on `main` and both are pushed to `NelsonGan/*`. The work happens
in `ricecal-screenshots-creator`; only the reading happens in `ricecal`.

## 1. Find where the last note stopped

The note is not cumulative and carries no date, so the boundary is written down
rather than inferred. It is written in the **PR body**, as a last line reading
`Covers: ricecal#136, ricecal#137`.

**It cannot live in the commit body.** Squash merging this repo keeps the
subject and throws the body away: `git log -1 --format=%B 0616027` is one line,
though that commit's branch had a full body. Step 7 writes the line into both
and only the PR copy is expected to survive.

```sh
cd ~/Projects/ricecal-screenshots-creator
git checkout main && git pull --ff-only
git log -3 --format='%h %s' -- src/data/appDescriptions.ts
```

Take the newest subject that is about the note, read the `(#N)` off it, then:

```sh
gh pr view <N> --json body -q .body | grep '^Covers: ricecal#'
```

The highest `ricecal#N` on that line is the last thing the live note describes.

Two fallbacks, in order:

1. **Any `ricecal#` reference in that body.**
   `gh pr view <N> --json body -q .body | grep -o 'ricecal#[0-9]*' | sort -u`.
   This is how the notes written before this skill are readable at all; PR #2
   named its two in prose.
2. **The commit date.** `git log -1 --format=%ad --date=short <sha>`, then in
   ricecal `git log --since=<that date>`. Least reliable, because a PR can merge
   days after the work it describes. Read the range before trusting it.

## 2. Read what has happened since

```sh
cd ~/Projects/ricecal
git pull --ff-only
git log --format='%h %ad %s' --date=short $(git log --format=%h --grep='(#<N>)' -1)..HEAD
```

Subjects are compressed to the point of being misleading about scope. Open the
body of each candidate before writing a word about it:

```sh
gh pr view <n> --repo NelsonGan/ricecal --json title,body,mergedAt
```

Note which side of the version bump each one landed, then **ask the stores
rather than the bump**. `ricecal#140` made every merge to `main` submit Android
straight to production, so several builds ship under one version number and
"merged after the bump" no longer means "not in the store".

```sh
gplay status --package com.nelsongan.ricecal        # production track's version code
asc versions list --app 6795558595 --output table   # iOS App Store versions
asc builds list --app 6795558595 --limit 5 --output table
```

Compare the build's upload time against the PR's `mergedAt`. For 1.0.2, Play
production was at version code 105 while `ricecal#140` had recorded 103, and
103 itself was uploaded 24 minutes after `ricecal#139` merged, so a change made
after the bump was in the store anyway. The App Store side ran the other way:
no 1.0.2 version record existed at all, only TestFlight builds, so the note
would reach iOS only when somebody created and submitted one.

A change that is genuinely ahead of every store build either waits for the next
note or the note goes out with the next build. Say which in the PR body; do not
decide it silently.

## 3. Keep only what a person using the app would notice

In: a new way to do something, a screen that behaves differently, a fix to
something that was visibly wrong.

Out, every time: version bumps, CI and release plumbing, backend compatibility
work, schema and Worker changes nobody sees, catalogue loads, comments, tests,
`AGENTS.md` and `README.md`. A release with nothing in the "in" column gets no
new note; leave the live one alone and say so rather than padding.

At most five bullets, and two or three is the usual shape. If six things
landed, the note takes the ones worth reading and drops the rest.

## 4. Write the English note

`en` is the source, and **the register is money2time's**. That is the sibling
app by the same owner, in the same 23 locales, and its store notes are the
user's own voice. Read the live one before writing a word:

```sh
python3 -c "
import re
s = open('$HOME/Projects/money2time-screenshots-creator/src/data/appDescriptions.ts').read()
print(re.search(r'\n  en: \{.*?whatsNew: \`(.*?)\`,', s, re.S).group(1))
"
```

RiceCal's own notes #2 and #4 are **not** the register. Both were written by
Claude and read like it; the rules below are what they failed. The shape:

```
- Added <one thing>
- Added <one thing>
- Fixed <one thing>

<closing line>
```

- **Features first, then fixes.**
- **One bare clause per bullet**, opening `Added` / `Fixed` / `Revamped`. About
  ten words, and **no comma**. A bullet that wants a comma is doing two things:
  drop the qualifier, or split it in two.
- **Four tics, and every one of them is how a machine writes a release note:**
  - the second person imperative: "**Write** your own food, or add somebody else's"
  - the trailing qualifier: "so logging it again **still looks like food**"
  - the contrast: "your own foods, **not just** the ones we know"
  - the example list: "the ones you have eaten, **like last week's nasi lemak**"
- **Name what changed, not how it was built.** "Added the ability to log
  someone else's food", not "Added a community shelf whose primary action logs
  into today".
- **Round numbers down and hedge them.** "Added over 100 more dishes", never
  "47 to 159": a precise count invites a mismatch with the PR and ages badly.
- **Tag a single-platform change** `(iPhone)` or `(Android)`.
- **Never tag anything Pro**, however much of it sits behind the paywall.
  Announce what is in the release and let the paywall speak for itself.
- **Replace, do not append.** The note describes this release, not the app's
  history. The previous bullets go.
- **Never name a screen or a label.** The listing is in 23 languages and the app
  speaks 13, so "Goals and targets" in Swedish points at a label no Swedish user
  can find. Say what changed, not where they tap.
- **Take the app's own words** for anything that is named (ingredient, gram,
  food, plate) from `apps/mobile/src/i18n/en/*`, so the note and the app agree
  in the 13 the app does speak.
- **No em dashes or en dashes**, here or in any translation. Comma, full stop,
  semicolon, brackets.
- **Under 500 characters per locale.** Play truncates there without warning, and
  German and French run about 40% longer than English.

The 1.0.2 note's second bullet, as Claude first wrote it and as it shipped:

```
- Write your own food, or add somebody else's to your day
- Added the ability to log someone else's food
```

The closing line is one short **unattributed** line about food or eating, and it
**must not repeat**. Unattributed because a misattribution ships in 23 languages
at once. Pull every one already spent first:

```sh
cd ~/Projects/ricecal-screenshots-creator
for c in $(git log --format=%h -- src/data/appDescriptions.ts); do
  git show "${c}:src/data/appDescriptions.ts" 2>/dev/null | python3 -c "
import sys, re
m = re.search(r'whatsNew: \`(.*?)\`,', sys.stdin.read(), re.S)
print(m.group(1).rsplit(chr(10), 1)[-1] if m else '')
"
done | sort -u
```

The **braces** matter: in zsh `$c:src/...` parses as a substitution modifier, so
you get a diff against the wrong text instead of the file. Spent so far: "Jom
makan", "Eat well, live well", "You are what you eat", "We eat first with our
eyes". Reach for one that fits the release rather than the most famous one left.

## 5. Translate into all 23 locales

Branch before the first edit, so nothing is written on `main`:

```sh
git checkout -b <a-branch-named-after-the-change>
```

The locales are `en ms zh id th vi ja ko hi fil es fr de pt it nl ru tr pl uk
sv nb da`, plus whatever the file holds if that list has grown. Edit `whatsNew` in place for
every one of them; touch no `description`.

**Take each locale's verb form from money2time's current note**, which is the
same 23 languages written by the same hand: `Menambah` in `ms`, `新增了` in
`zh`, `Se anadieron` in `es`, `Lade till` in `sv`, `Nagdagdag ng` in `fil`,
`...しました` in `ja`. Do not invent one, and do not translate "Added" literally
into a form that language would not use in a store note.

**Stay as terse as the English.** A translation is not the place to put back the
qualifier the English bullet dropped, and no bullet gains a comma on the way
into another language.

Where the app speaks the language, the nouns come from
`apps/mobile/src/i18n/<locale>/*` so the note matches the app's own wording;
where it does not, translate plainly. Keep **RiceCal** untranslated.

## 6. Verify before opening anything

```sh
cd ~/Projects/ricecal-screenshots-creator
npx tsc --noEmit                       # there is no typecheck script
git diff --stat                        # appDescriptions.ts and nothing else
grep -c 'whatsNew:' src/data/appDescriptions.ts   # still 23
```

Then the two things a diff does not show. Play's 500 character cap:

```sh
node -e "
const s = require('fs').readFileSync('src/data/appDescriptions.ts', 'utf8');
const r = /^  ([a-z-]+): \{[\s\S]*?whatsNew: \`([\s\S]*?)\`,/gm;
const out = []; let m;
while ((m = r.exec(s))) out.push([m[1], m[2].length]);
out.sort((a, b) => b[1] - a[1]);
console.log(out.length + ' locales, longest ' + out[0][0] + ' at ' + out[0][1]);
const over = out.filter((x) => x[1] > 500).map((x) => x[0]);
console.log(over.length ? 'OVER 500: ' + over.join(', ') : 'all under 500');
"
```

and that no `description` moved. Grepping the diff for `description:` only sees
the line the keyword is on, and these are multi line templates, so compare the
values against `main`:

```sh
node -e "
const { execSync } = require('child_process');
const read = (t) => {
  const r = /^  ([a-z-]+): \{\s*description: \`([\s\S]*?)\`,/gm;
  const o = {}; let m;
  while ((m = r.exec(t))) o[m[1]] = m[2];
  return o;
};
const was = read(execSync('git show main:src/data/appDescriptions.ts', { encoding: 'utf8' }));
const now = read(require('fs').readFileSync('src/data/appDescriptions.ts', 'utf8'));
const moved = Object.keys({ ...was, ...now }).filter((k) => was[k] !== now[k]);
console.log(moved.length ? 'DESCRIPTION CHANGED: ' + moved.join(', ') : Object.keys(now).length + ' descriptions unchanged');
"
```

Then the shape, which is what a translation quietly breaks: a locale that lost
a bullet, or gained a comma, passes every check above.

```sh
python3 - <<'PY'
import re
src = open('src/data/appDescriptions.ts').read()
rows = re.findall(r"\n  ([a-z]{2,3}): \{.*?whatsNew: `(.*?)`,", src, re.S)
n = len([l for l in rows[0][1].split('\n') if l.startswith('- ')])
for loc, note in rows:
    lines = note.split('\n')
    bullets = [l for l in lines if l.startswith('- ')]
    bad = []
    if len(bullets) != n: bad.append('%d bullets, en has %d' % (len(bullets), n))
    if lines[-2] != '' or not lines[-1].strip(): bad.append('no closing line')
    if any(c in ' '.join(bullets) for c in ',，،'): bad.append('comma in a bullet')
    if bad: print(loc, '->', '; '.join(bad))
print('%d locales checked, %d bullets each' % (len(rows), n))
PY
```

Then read the diff itself for a stray `—` or `–`; no command catches one.

## 7. Open the PR

```sh
git status --porcelain          # appDescriptions.ts and nothing else
git commit -am "<a sentence about what changed>"
git push -u origin HEAD
gh pr create --title "<the same sentence>" --body "$(cat <<'EOF'
...
EOF
)"
```

Write the body out rather than using `--fill`: it carries, in this order, the
English note in a fence, one line per covered ricecal PR with a
`[ricecal#N](https://github.com/NelsonGan/ricecal/pull/N)` link saying what it
actually did, which app version the note goes out with and whether anything in
it is ahead of that build, the longest locale and its length, and that
`description` is untouched and `tsc` is clean.

**Its last line is the one the next run reads**, after any attribution footer
or before it, as long as it starts the line:

```
Covers: ricecal#136, ricecal#137, ricecal#139
```

Put the same line at the end of the commit body too. The squash drops it there,
but the branch keeps it, and a repo that merges differently later gets it for
free.

Attribution footers are whatever the session was told to use.

## Traps

- **The two repos are separate checkouts.** Nothing in ricecal-screenshots-creator
  is a submodule of ricecal, and a `cd` in one shell does not carry. Use
  `git -C` or full paths.
- **`git log --grep='(#135)'` matches the squash subject**, which is how a PR
  number becomes a sha. A merge commit that is not a squash (there are a few
  early ones) has no `(#N)`, so a subject without one is normal and needs
  reading rather than skipping.
- **Do not touch `src/scenes/locales/*.ts`.** Those are the screenshot captions
  and share nothing with the listing but the numbers in the brand panel.
- **The note is not the description.** The description changes when the app's
  feature set does, which is rare and is a separate decision. Leaving it byte
  identical is the point of checking.

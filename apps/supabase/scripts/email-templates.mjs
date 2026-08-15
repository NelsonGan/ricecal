#!/usr/bin/env node
/**
 * Builds the auth emails out of `apps/supabase/templates/` and, with `--push`,
 * sends them to the project.
 *
 * THE TEMPLATES ARE A FOLDER IN THIS REPO, and the dashboard is a mirror of it.
 * Edited in the dashboard they live in one text box per message, with no way to
 * see two of them side by side, no history, and no review; the first person to
 * change the shared footer changes it in one of eight places. Here they are
 * eight bodies over one layout, and the layout is where the design lives.
 *
 * Three modes:
 *
 *   pnpm email:build    write templates/build/*.html
 *   pnpm email:check    fail if templates/build/*.html is out of date (CI)
 *   pnpm email:push     build, then PATCH the project's auth config
 *
 * `build/` is COMMITTED, the same bargain `theme:gen` makes with its CSS: the
 * local stack reads those files straight off disk (see the
 * `auth.email.template.*` blocks in config.toml), a reviewer can read the email
 * that will actually be sent, and `--check` in CI is what stops the two
 * drifting.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { managementFetch } from './lib/management.mjs'
import { projectRef } from './lib/sql.mjs'

const TEMPLATES = fileURLToPath(new URL('../templates', import.meta.url))
const BUILD = join(TEMPLATES, 'build')

/** `<!--\nkey: confirmation\nsubject: ...\n-->` off the top of a body file. */
function readMeta(source) {
  const block = source.match(/^\s*<!--\s*\n([\s\S]*?)\n\s*-->/)
  if (!block) throw new Error('no metadata block')

  const meta = {}
  for (const line of block[1].split('\n')) {
    const [, name, value] = line.match(/^\s*([a-z_]+):\s*(.*)$/) ?? []
    if (name) meta[name] = value.trim()
  }
  if (!meta.key) throw new Error('metadata has no `key`')
  if (!meta.subject) throw new Error('metadata has no `subject`')

  return { meta, body: source.slice(block[0].length) }
}

/** The named blocks in `_partials.html`, by name. */
function readPartials() {
  const source = readFileSync(join(TEMPLATES, '_partials.html'), 'utf8')
  const found = new Map()
  const pattern = /<!--\s*PARTIAL\s+(\w+)\s*-->([\s\S]*?)<!--\s*\/PARTIAL\s*-->/g

  for (const [, name, content] of source.matchAll(pattern)) {
    found.set(name, content.trim())
  }
  return found
}

/**
 * Splices `<!--PARTIAL:name-->` and `<!--PARTIAL:name|arg-->` in.
 *
 * One pass, so a partial cannot include another. That is a limit rather than an
 * oversight: two levels of this and the build needs a cycle check, and nothing
 * here wants one.
 */
function expand(body, partials) {
  return body.replace(/<!--PARTIAL:(\w+)((?:\|[^\n]*?)?)-->/g, (_, name, rawArgs) => {
    const block = partials.get(name)
    if (!block) throw new Error(`unknown partial "${name}"`)

    const args = rawArgs ? rawArgs.split('|').slice(1) : []
    return block.replace(/\$(\d)/g, (whole, index) => args[Number(index) - 1] ?? whole)
  })
}

/** Strips the comments meant for whoever is reading the folder, not the email. */
function stripComments(html) {
  // Only comments that are OURS. Nothing here emits a conditional comment, but
  // if a body ever needs one for Outlook it must survive.
  return html.replace(/<!--(?!\[if)(?!<!)[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n')
}

function build() {
  const layoutFile = readFileSync(join(TEMPLATES, '_layout.html'), 'utf8')

  // From the doctype, so the note at the top of the layout is not part of the
  // document. It has to go before the substitutions rather than after: that
  // note TALKS ABOUT the placeholders, and prose naming one is indistinguishable
  // from the placeholder itself to a `.replace` that takes the first match.
  const start = layoutFile.indexOf('<!doctype')
  if (start < 0) throw new Error('_layout.html has no doctype')
  const layout = layoutFile.slice(start)

  /**
   * The app icon, inline.
   *
   * A data URI rather than a URL, and the difference matters more in mail than
   * anywhere else: most clients block remote images until the reader asks, so a
   * hosted logo is an empty box at the top of every message for as long as it
   * takes somebody to notice a prompt they have learnt to ignore. Inline there
   * is nothing to fetch and nothing to block, and no asset host that has to
   * outlive the mail.
   *
   * It costs about 9KB per message. Gmail clips a mail over 102KB, and these
   * come out around a fifth of that, so the headroom is real rather than
   * hopeful. Kept at 96px for a 64pt box, which is the 2x anybody reads it at.
   */
  const logo = readFileSync(join(TEMPLATES, 'logo.png')).toString('base64')
  const logoUri = `data:image/png;base64,${logo}`

  const partials = readPartials()

  const files = readdirSync(TEMPLATES)
    .filter((name) => name.endsWith('.html') && !name.startsWith('_'))
    .sort()

  return files.map((file) => {
    let meta
    let body
    try {
      ;({ meta, body } = readMeta(readFileSync(join(TEMPLATES, file), 'utf8')))
    } catch (error) {
      throw new Error(`${file}: ${error.message}`)
    }

    const html = stripComments(
      layout
        .replace('<!--CONTENT-->', () => expand(body, partials).trim())
        .replace('<!--SUBJECT-->', () => meta.subject)
        .replace('<!--PREHEADER-->', () => meta.preheader ?? '')
        // After the others and inside the same chain, so the base64 — which is
        // the one substitution long enough to contain anything — cannot be
        // scanned for the placeholders that come before it.
        .replace('<!--LOGO-->', () => logoUri),
    ).trim()

    return { name: basename(file, '.html'), key: meta.key, subject: meta.subject, html }
  })
}

/**
 * The auth-config fields one template writes.
 *
 * A security notification also has to be switched ON, and that flag is derived
 * rather than listed: a template whose key ends in `_notification` and no
 * matching `mailer_notifications_*_enabled` is a template that is pushed,
 * looks right in the dashboard, and is never sent.
 */
function fieldsFor({ key, subject, html }) {
  const fields = {
    [`mailer_subjects_${key}`]: subject,
    [`mailer_templates_${key}_content`]: html,
  }

  const notification = key.match(/^(.+)_notification$/)
  if (notification) fields[`mailer_notifications_${notification[1]}_enabled`] = true

  return fields
}

/**
 * The local stack has its own copy of every subject, and this is what stops it
 * drifting.
 *
 * The CLI takes a template's subject separately from its body, so `config.toml`
 * repeats what each file's metadata block already says. Repeated by hand, those
 * two agree until somebody edits one — and the symptom is the worst kind: the
 * mail a developer reads on a local stack has a different subject line from the
 * one production sends, so the difference is invisible until a user mentions it.
 *
 * `[auth.email.notification.*]` is deliberately not checked. Its `content_path`
 * is resolved from a DIFFERENT directory than a template's (see the note in
 * config.toml), and a check that pretended otherwise would be wrong about the
 * one thing worth being right about.
 */
function configDrift(built) {
  const config = readFileSync(fileURLToPath(new URL('../config.toml', import.meta.url)), 'utf8')
  const problems = []

  for (const template of built) {
    const block = config.match(
      new RegExp(`\\[auth\\.email\\.template\\.${template.key}\\]([\\s\\S]*?)\\n\\[`),
    )?.[1]
    if (!block) continue // a notification, or a template the local stack does not set

    // The CLI escapes Go's own delimiters so its templating leaves them alone,
    // which is why this is not a plain string comparison.
    const subject = block.match(/subject\s*=\s*"(.*)"/)?.[1]?.replaceAll('`', '')
    const wanted = template.subject.replace(/\{\{ (\.\w+) \}\}/g, '{{ {{ $1 }} }}')

    if (subject !== wanted) {
      problems.push(`${template.name}: config.toml says "${subject}", the file says "${wanted}"`)
    }
    if (!block.includes(`build/${template.name}.html`)) {
      problems.push(`${template.name}: config.toml points at a different file`)
    }
  }

  return problems
}

async function main() {
  const mode = process.argv[2] ?? '--build'
  const built = build()

  if (mode === '--check') {
    const drift = configDrift(built)
    if (drift.length) {
      process.stderr.write(`config.toml and the templates disagree:\n  ${drift.join('\n  ')}\n`)
      process.exit(1)
    }

    const stale = built.filter((template) => {
      let current = null
      try {
        current = readFileSync(join(BUILD, `${template.name}.html`), 'utf8')
      } catch {
        /* missing counts as stale */
      }
      return current !== `${template.html}\n`
    })

    if (stale.length) {
      process.stderr.write(
        `Email templates are out of date: ${stale.map((t) => t.name).join(', ')}\n` +
          'Run `pnpm email:build` and commit the result.\n',
      )
      process.exit(1)
    }
    process.stdout.write(`${built.length} email templates up to date\n`)
    return
  }

  mkdirSync(BUILD, { recursive: true })
  for (const template of built) {
    writeFileSync(join(BUILD, `${template.name}.html`), `${template.html}\n`)
  }
  process.stdout.write(`Built ${built.length} email templates into templates/build/\n`)

  if (mode !== '--push') return

  const ref = projectRef()
  const payload = Object.assign({}, ...built.map(fieldsFor))

  await managementFetch(`/projects/${ref}/config/auth`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

  process.stdout.write(`Pushed ${built.length} templates to ${ref}\n`)
  for (const template of built) {
    process.stdout.write(`  ${template.key.padEnd(34)} ${template.subject}\n`)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

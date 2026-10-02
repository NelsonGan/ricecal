import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { ga4EventName } from '../ga4'

const plan = ts.createSourceFile(
  'events.ts',
  readFileSync(resolve(__dirname, '../events.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
)
const events = plan.statements.find(
  (node): node is ts.TypeAliasDeclaration =>
    ts.isTypeAliasDeclaration(node) && node.name.text === 'Events',
)
if (!events || !ts.isTypeLiteralNode(events.type)) throw new Error('Missing tracking plan')
const members = events.type.members
const names = members.map((member) => (member.name as ts.StringLiteral).text)
const readme = readFileSync(resolve(__dirname, '../../../../../../README.md'), 'utf8')
const table = readme
  .split('<!-- analytics-app-events:start -->')[1]
  ?.split('<!-- analytics-app-events:end -->')[0]

it('documents every app event exactly once with its real GA4 name', () => {
  expect(table).toBeDefined()
  const rows =
    table
      ?.split('\n')
      .filter((line) => /^\| [A-Z]/.test(line) && !line.startsWith('| Mixpanel event')) ?? []
  expect(rows.map((line) => line.split('|')[1].trim()).sort()).toEqual([...names].sort())
  for (const name of names) {
    const row = rows.find((line) => line.split('|')[1].trim() === name)
    expect(row?.split('|')[2].trim()).toBe(ga4EventName(name))
    expect(row?.split('|')[4]).toMatch(/`(?:src|app)\//)
    const sources = [...(row?.split('|')[4].matchAll(/`((?:src|app)\/[^`]+)`/g) ?? [])]
    for (const [, source] of sources) {
      expect(existsSync(resolve(__dirname, '../../../../', source))).toBe(true)
    }
    expect(row?.split('|')[5].trim()).toMatch(/\S/)
  }
})

it('keeps documented properties synchronized with the typed plan', () => {
  for (const member of members) {
    if (!ts.isPropertySignature(member)) continue
    const name = (member.name as ts.StringLiteral).text
    const row = table?.split('\n').find((line) => line.startsWith(`| ${name} |`))
    const props =
      member.type && ts.isTypeLiteralNode(member.type)
        ? member.type.members
            .filter(ts.isPropertySignature)
            .map(
              (property) =>
                `${property.name.getText(plan)}${property.questionToken ? '?' : ''}: ${property.type?.getText(plan)}`,
            )
            .join('; ')
        : 'none'
    const normalized = props.replace(/\|/g, '&#124;').replace(/\s+/g, ' ').trim()
    expect(row?.split('|')[3].trim()).toBe(normalized)
  }
})

it('keeps GA4 event names unique and reserves settled revenue for RevenueCat', () => {
  expect(new Set(names.map(ga4EventName)).size).toBe(names.length)
  expect(names.some((name) => /^(purchase|refund|renewal)$/i.test(name))).toBe(false)
  for (const member of members) {
    if (!ts.isPropertySignature(member) || !member.type || !ts.isTypeLiteralNode(member.type))
      continue
    expect(
      member.type.members.some((property) =>
        /^(revenue|price|currency|transaction_id)$/.test(property.name?.getText(plan) ?? ''),
      ),
    ).toBe(false)
  }
})

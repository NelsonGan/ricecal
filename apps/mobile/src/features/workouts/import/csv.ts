/**
 * A CSV reader for workout exports: quoted fields, doubled quotes, commas and
 * line breaks inside quotes, a byte order mark, CRLF.
 *
 * Splitting lines on commas is not enough. Strong writes a workout's notes
 * verbatim, so one note with a comma or a line break in it shifts every column
 * after it, and the whole history imports one column off without an error.
 *
 * Strong's newer export, and any file round-tripped through a spreadsheet in a
 * comma-decimal locale, separates fields with semicolons. The header decides:
 * it holds no numbers, so a semicolon there is a separator.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '')
  const separator = separatorOf(source)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += char
    } else if (char === '"') quoted = true
    else if (char === separator) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
    } else field += char
  }
  row.push(field)
  if (row.some((cell) => cell !== '')) rows.push(row)
  return rows
}

function separatorOf(source: string): ',' | ';' {
  const end = source.search(/[\r\n]/)
  const header = (end === -1 ? source : source.slice(0, end)).replace(/"[^"]*"/g, '')
  const count = (char: string) => header.split(char).length - 1
  return count(';') > count(',') ? ';' : ','
}
